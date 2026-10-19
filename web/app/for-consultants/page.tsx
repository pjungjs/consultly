import InfoPage from "../info-page";

export const metadata = { title: "For consultants · Consultly" };

export default function Page() {
  return (
    <InfoPage
      title="For consultants"
      intro="Set your hours and your rate. We handle scheduling, payment and reminders."
      sections={[
        { heading: "Your schedule, your timezone", body: "Set weekly hours once in your own timezone. Clients anywhere see them converted to theirs, including across daylight-saving changes." },
        { heading: "Paid before you meet", body: "Sessions are confirmed only after payment, so there are no unpaid no-shows." },
        { heading: "Your dashboard", body: "Sign in with your profile email to see this month's calendar, upcoming clients and earnings, and to cancel and refund a session if you need to." },
      ]}
    />
  );
}
