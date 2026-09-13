import Header from "./components/Header";
import Hero from "./components/Hero";
import ForClients from "./components/ForClients";
import ForOwners from "./components/ForOwners";
import Comparison from "./components/Comparison";
import Pricing from "./components/Pricing";
import DemoCta from "./components/DemoCta";
import Footer from "./components/Footer";

function Landing() {
  return (
    <div className="bg-paper">
      <Header />
      <Hero />
      <ForClients />
      <ForOwners />
      <Comparison />
      <Pricing />
      <DemoCta />
      <Footer />
    </div>
  );
}

export default Landing;
