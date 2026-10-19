import InfoPage from "../info-page";

export const metadata = { title: "Terms · Consultly" };

export default function Page() {
  return (
    <InfoPage
      title="Terms of service"
      intro="Template only. Have a lawyer write the real terms before launch."
      sections={[
        { heading: "Bookings", body: "A session is confirmed once payment succeeds. Held times are released if payment isn't completed within 30 minutes." },
        { heading: "Cancellations and refunds", body: "If a consultant cancels a session, the client is refunded that session's price in full." },
        { heading: "Advice", body: "Consultants are independent professionals and are responsible for the advice they give." },
      ]}
    />
  );
}
