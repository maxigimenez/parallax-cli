import { Link } from "react-router-dom";
import Layout from "../components/Layout";

const NotFound = () => {
  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="text-center">
          <h1 className="font-display text-6xl font-bold text-foreground mb-4">
            404<span className="text-primary animate-blink">_</span>
          </h1>
          <p className="text-muted-foreground mb-8">
            This route doesn't exist in the orchestrator.
          </p>
          <Link to="/" className="text-primary hover:underline text-sm font-mono">
            ← back to parallax_
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
