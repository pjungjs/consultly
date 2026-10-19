import InfoPage from "../info-page";

export const metadata = { title: "How it works · Consultly" };

export default function Page() {
  return (
    <InfoPage
      title="How it works"
      intro="From search to a booked call in a few minutes."
      sections={[
        { heading: "Find someone", body: "Search by topic or filter by category, price and availability. Every profile shows open times in your own timezone." },
        { heading: "Pick your times", body: "Choose one session or several. We hold them for 30 minutes while you pay securely with Stripe." },
        { heading: "Meet", body: "You get a confirmation email with a calendar invite. Sign in with your email any time to see your bookings." },
        { heading: "If plans change", body: "If a consultant has to cancel, you're refunded in full for that session automatically." },
      ]}
    />
  );
}
