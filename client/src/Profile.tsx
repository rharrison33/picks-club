import { useState } from "react";
import { api, messageOf } from "./api";
import FavoriteTeams from "./FavoriteTeams";
import SmsSettings from "./SmsSettings";
import type { User } from "./types";

export default function Profile({
  user,
  onSave,
}: {
  user: User;
  onSave: (user: User) => void;
}) {
  const [photo, setPhoto] = useState(user.photoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [photoInfo, setPhotoInfo] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setNotice("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 25 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG, or WebP photo up to 25 MB.");
      return;
    }
    setProcessing(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Photo processing is unavailable in this browser.");
        const side = Math.min(bitmap.width, bitmap.height);
        let compressed: Blob | null = null;
        // Prefer sharp, high-quality thumbnails; reduce dimensions before heavy compression.
        for (const size of [384, 320, 256, 192, 128]) {
          canvas.width = canvas.height = Math.min(size, side);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            bitmap,
            (bitmap.width - side) / 2,
            (bitmap.height - side) / 2,
            side,
            side,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          for (const quality of [0.92, 0.86, 0.8]) {
            compressed = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/jpeg", quality),
            );
            if (compressed && compressed.size <= 65536) break;
          }
          if (compressed && compressed.size <= 65536) break;
        }
        if (!compressed || compressed.size > 65536)
          throw new Error("Could not resize photo.");
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(compressed);
        });
        setPhoto(dataUrl);
        setPhotoInfo(
          `${(file.size / (1024 * 1024)).toFixed(1)} MB original → ${Math.ceil(compressed.size / 1024)} KB profile photo. Ready to save.`,
        );
      } finally {
        bitmap.close();
      }
    } catch {
      setError("Could not read that photo. Try another image.");
    } finally {
      setProcessing(false);
    }
  }
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ user: User }>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          venmoUrl: String(form.get("venmoUrl") ?? "").trim(),
          photoUrl: photo,
          favoriteTeams: form.getAll("favoriteTeams"),
        }),
      });
      onSave(result.user);
      setNotice(
        "Profile saved. Your favorites will be used for new lineup recommendations.",
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-page">
      <a href="#">← Back to my pools</a>
      <h1>My profile</h1>
      <form className="panel stack-form" onSubmit={save}>
        <fieldset disabled={busy || processing}>
          <div className="profile-photo-preview">
            {photo ? (
              <img src={photo} alt="Profile preview" />
            ) : (
              <span>{user.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <label>
            Profile photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <small>
            JPEG, PNG, or WebP, up to 25 MB. We automatically crop and optimize
            your photo before uploading. Your original file stays unchanged.
          </small>
          {photoInfo && <small role="status">{photoInfo}</small>}
          {photo && (
            <button
              type="button"
              onClick={() => {
                setPhoto("");
                setPhotoInfo("");
              }}
            >
              Remove photo
            </button>
          )}
          <label>
            Display name
            <input
              name="name"
              defaultValue={user.name}
              minLength={3}
              maxLength={60}
              required
            />
          </label>
          <label>
            Email
            <input value={user.email} readOnly type="email" />
          </label>
          <label>
            Your Venmo link
            <input
              name="venmoUrl"
              type="url"
              defaultValue={user.venmoUrl ?? ""}
              placeholder="https://venmo.com/your-profile"
            />
          </label>
          <small>
            Optional. Shared with your pool organizers so they can send
            winnings. Photos and display names are visible to pool members.
            Transfers happen outside Picks Club.
          </small>
          <FavoriteTeams initial={user.favoriteTeams} />
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          <button className="primary">
            {processing
              ? "Preparing photo…"
              : busy
                ? "Saving…"
                : "Save profile"}
          </button>
        </fieldset>
      </form>
      <SmsSettings />
    </section>
  );
}
