import InfoPage from "../info-page";

export const metadata = { title: "Contact · Consultly" };

export default function Page() {
  return (
    <InfoPage
      title="Contact"
      intro="Questions about a booking, a payment or joining as a consultant? We usually reply within one business day."
      sections={[
        { heading: "Email", body: "hello@consultly.example (placeholder: replace with your support address)" },
        { heading: "About a booking", body: "Include the email you booked with and the date of your session so we can find it quickly." },
      ]}
    />
  );
}
