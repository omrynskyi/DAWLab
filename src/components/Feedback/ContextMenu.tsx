import { useEffect, useRef } from "react";
import { motion } from "motion/react";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "danger" | "success";
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  footer?: React.ReactNode;
}

const SPRING = { type: "spring" as const, stiffness: 500, damping: 32, mass: 0.8 };

export default function ContextMenu({ x, y, items, onClose, footer }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const menuWidth = 190;
  const menuHeight = 160;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

  return (
    <motion.div
      ref={menuRef}
      className="context-menu context-menu--fixed"
      style={{ left: adjustedX, top: adjustedY }}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={SPRING}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={`context-menu__item${item.variant === "danger" ? " context-menu__item--danger" : item.variant === "success" ? " context-menu__item--success" : ""}`}
          onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
        >
          {item.icon}
          {item.label}
        </div>
      ))}
      {footer && (
        <>
          {items.length > 0 && <div className="context-menu__divider" />}
          {footer}
        </>
      )}
    </motion.div>
  );
}
