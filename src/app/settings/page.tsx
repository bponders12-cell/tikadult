import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  getUserSettings,
  updateUserSettings,
  type FeedLayout,
  type PrivacyPrefs,
  type MessagingPrefs,
} from "@/lib/settings";
import LayoutToggle from "@/components/feed/LayoutToggle";

function boolFrom(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === "on" || value === "true";
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login?next=/settings");
  }
  const settings = await getUserSettings(session.user.id);

  async function saveSettings(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s?.user?.id) {
      redirect("/login?next=/settings");
    }
    const feedLayout = (formData.get("feedLayout") as FeedLayout) || "immersive";
    const privacyPrefs: PrivacyPrefs = {
      profileVisibility:
        (formData.get("profileVisibility") as PrivacyPrefs["profileVisibility"]) ||
        "public",
      allowMessagesFrom:
        (formData.get("allowMessagesFrom") as PrivacyPrefs["allowMessagesFrom"]) ||
        "everyone",
      showActivity: formData.get("showActivity") === "on",
    };
    const messagingPrefs: MessagingPrefs = {
      readReceipts: formData.get("readReceipts") === "on",
      typingIndicators: formData.get("typingIndicators") === "on",
      allowMedia: formData.get("allowMedia") === "on",
    };
    await updateUserSettings(s.user.id, s.user.id, {
      feedLayout,
      privacyPrefs,
      messagingPrefs,
    });
    revalidatePath("/settings");
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Settings</h1>
      <p>Manage your feed layout and privacy/messaging preferences.</p>

      <section style={{ marginTop: 24 }}>
        <h2>Feed layout</h2>
        <p>
          Current: <strong data-testid="current-layout">{settings.feedLayout}</strong>
        </p>
        <LayoutToggle value={settings.feedLayout} persist />
      </section>

      <form action={saveSettings} style={{ marginTop: 24, display: "grid", gap: 16 }}>
        <input type="hidden" name="feedLayout" value={settings.feedLayout} />

        <fieldset>
          <legend>Privacy preferences</legend>
          <label>
            Profile visibility{" "}
            <select
              name="profileVisibility"
              defaultValue={settings.privacyPrefs.profileVisibility ?? "public"}
            >
              <option value="public">Public</option>
              <option value="friends">Friends</option>
              <option value="private">Private</option>
            </select>
          </label>
          <br />
          <label>
            Allow messages from{" "}
            <select
              name="allowMessagesFrom"
              defaultValue={settings.privacyPrefs.allowMessagesFrom ?? "everyone"}
            >
              <option value="everyone">Everyone</option>
              <option value="friends">Friends</option>
              <option value="no_one">No one</option>
            </select>
          </label>
          <br />
          <label>
            <input
              type="checkbox"
              name="showActivity"
              defaultChecked={!!settings.privacyPrefs.showActivity}
            />{" "}
            Show activity status
          </label>
        </fieldset>

        <fieldset>
          <legend>Messaging preferences</legend>
          <label>
            <input
              type="checkbox"
              name="readReceipts"
              defaultChecked={!!settings.messagingPrefs.readReceipts}
            />{" "}
            Read receipts
          </label>
          <br />
          <label>
            <input
              type="checkbox"
              name="typingIndicators"
              defaultChecked={!!settings.messagingPrefs.typingIndicators}
            />{" "}
            Typing indicators
          </label>
          <br />
          <label>
            <input
              type="checkbox"
              name="allowMedia"
              defaultChecked={!!settings.messagingPrefs.allowMedia}
            />{" "}
            Allow media in messages
          </label>
        </fieldset>

        <div>
          <button type="submit">Save preferences</button>
        </div>
      </form>

      <p style={{ marginTop: 24 }}>
        <Link href={`/profile/${session.user.handle ?? session.user.id}`}>View profile</Link>
      </p>
    </main>
  );
}
