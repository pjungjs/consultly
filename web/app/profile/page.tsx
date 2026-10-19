import type { Metadata } from "next";
import ProfileEditor from "./profile-editor";

export const metadata: Metadata = { title: "Profile · Consultly" };

export default function ProfilePage() {
  return <ProfileEditor />;
}
