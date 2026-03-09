import Layout from "../components/Layout";
import ScrollReveal from "../components/ScrollReveal";
import HeroSection from "../components/HeroSection";
import ConfigSection from "../components/ConfigSection";
import IntegrationsSection from "../components/IntegrationsSection";
import FeaturesSection from "../components/FeaturesSection";

const Index = () => {
  return (
    <Layout>
      <ScrollReveal>
        <HeroSection />
      </ScrollReveal>
      <ScrollReveal>
        <IntegrationsSection />
      </ScrollReveal>
      <ScrollReveal>
        <ConfigSection />
      </ScrollReveal>
      <ScrollReveal>
        <FeaturesSection />
      </ScrollReveal>
    </Layout>
  );
};

export default Index;
