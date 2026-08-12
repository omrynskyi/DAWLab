import React, { useEffect, useState } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Outlet,
  useNavigate,
} from "react-router-dom";
import { Layout } from "./components/Layout";
import { SplashScreen } from "./components/SplashScreen";
import { Onboarding } from "./components/Onboarding/Onboarding";
import { Library } from "./pages/Library";
import { Settings } from "./pages/Settings";
import { History } from "./pages/History";
import CleanStorage from "./pages/Settings/CleanStorage";
import DitherLab from "./pages/DitherLab/DitherLab";
import "./App.css";

const DeepLinkHandler: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleOpenProject = (
      _event: any,
      data: { projectName: string; projectId: string; commitId?: string },
    ) => {
      navigate(`/history/${data.projectId}`, {
        state: {
          projectName: data.projectName,
          focusedCommitId: data.commitId,
        },
      });
    };

    window.ipcRenderer.on("open-project", handleOpenProject);
    return () => {
      window.ipcRenderer.removeAllListeners("open-project");
    };
  }, [navigate]);

  return <>{children}</>;
};

type AppPhase = "loading" | "onboarding" | "app";

function App() {
  const [showSplash, setShowSplash] = useState(true);
  // "loading" until we know whether a user exists; first run (no user) →
  // "onboarding". The routed app only mounts in the "app" phase so the Library
  // always loads fresh once a user and any imported projects exist.
  const [phase, setPhase] = useState<AppPhase>("loading");
  // Dev-only playground route — track the hash so it works without a reload.
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    window.ipcRenderer.invoke("get-username").then((user: string | null) => {
      setPhase(user ? "app" : "onboarding");
    });

    // Settings → "Run setup again" re-enters onboarding from anywhere.
    const rerun = () => setPhase("onboarding");
    window.addEventListener("dawlab:run-onboarding", rerun);
    return () => window.removeEventListener("dawlab:run-onboarding", rerun);
  }, []);

  const finishOnboarding = () => {
    // Land on the library regardless of where "run setup again" was triggered.
    window.location.hash = "#/";
    setPhase("app");
  };

  // Dev-only shader playground — bypasses splash/onboarding/routing entirely.
  // Reachable at `#/dev/dither-lab` in dev builds only.
  if (import.meta.env.DEV && hash.startsWith("#/dev/dither-lab")) {
    return <DitherLab />;
  }

  return (
    <Router>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      {phase === "onboarding" && <Onboarding onComplete={finishOnboarding} />}
      {phase === "app" && (
        <DeepLinkHandler>
          <Routes>
            <Route
              element={
                <Layout>
                  <Outlet />
                </Layout>
              }
            >
              <Route path="/" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/clean-storage" element={<CleanStorage />} />
              <Route path="/history/:projectId" element={<History />} />
            </Route>
          </Routes>
        </DeepLinkHandler>
      )}
    </Router>
  );
}

export default App;
