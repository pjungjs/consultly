import InfoPage from "../info-page";

export const metadata = { title: "Privacy · Consultly" };

export default function Page() {
  return (
    <InfoPage
      title="Privacy"
      intro="Template only. Replace with a reviewed privacy policy before launch."
      sections={[
        { heading: "What we collect", body: "Your name, email, timezone and the sessions you book. Card details are handled by Stripe and never touch our servers." },
        { heading: "Why", body: "To confirm bookings, send your confirmation and sign-in emails, and show consultants who they're meeting." },
        { heading: "Cookies", body: "One sign-in cookie that keeps you signed in for 7 days. No advertising or tracking cookies." },
      ]}
    />
  );
}
