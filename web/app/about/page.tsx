import InfoPage from "../info-page";

export const metadata = { title: "About · Consultly" };

export default function Page() {
  return (
    <InfoPage
      title="About Consultly"
      intro="Consultly connects people who need a straight answer with independent experts who have solved the same problem before."
      sections={[
        { heading: "Why we exist", body: "Good advice is usually one conversation away, but finding the right person, agreeing on a time and paying them takes days of back-and-forth. We collapse that into a single page." },
        { heading: "How we choose consultants", body: "Every consultant is independent and sets their own hours and rate. We look for people with hands-on experience, not titles." },
      ]}
    />
  );
}
