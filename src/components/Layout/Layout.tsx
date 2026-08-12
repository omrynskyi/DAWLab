import React from 'react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import './Layout.css';
// import { Header } from '../Header';
import { ActivityPanel } from '../ActivityPanel';
import { PreviewNotification } from '../PreviewNotification';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isLibraryPage = location.pathname === '/';

  /* Sidebar logic commented out for now
  const [isSidebarVisible, setIsSidebarVisible] = useState(window.innerWidth > 1000);

  useEffect(() => {
    const handleResize = () => {
      setIsSidebarVisible(window.innerWidth > 600);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  */

  return (
    <div className="app-layout">
      {/* Sidebar hidden for now */}
      {/* <Header isVisible={isSidebarVisible} /> */}
      <motion.div
        className="main-content-wrapper"
        initial={false}
        animate={{
          marginLeft: 0,
          width: '100%',
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {/* Draggable strip for the frameless titlebar (macOS traffic lights) */}
        <div className="top-header-bar" />
        <main className="app-main">
          {children}
        </main>
      </motion.div>
      {!isLibraryPage && <ActivityPanel />}
      <PreviewNotification />
    </div>
  );
};
