import { forwardRef } from "react";
import { Pencil, Trash2Icon, GitBranch, Eye } from "lucide-react";
import "./ContextMenu.css";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(
  ({ x, y, items }, ref) => {
    return (
      <div ref={ref} className="context-menu" style={{ top: y, left: x }}>
        {items.map((item, index) => (
          <button
            key={index}
            onClick={item.onClick}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    );
  },
);

ContextMenu.displayName = "ContextMenu";

// Preset menu configs for common use cases
export const createFolderMenuItems = (
  onRename: () => void,
  onDelete: () => void,
): ContextMenuItem[] => [
  { label: "Rename", icon: <Pencil size={14} />, onClick: onRename },
  {
    label: "Delete",
    icon: <Trash2Icon size={14} />,
    onClick: onDelete,
    danger: true,
  },
];

export const createCommitMenuItems = (
  onPreviewCommit: () => void,
  onBranchFromCommit: () => void,
  onDeleteCommit?: () => void,
): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [
    {
      label: "Preview this Version",
      icon: <Eye size={14} />,
      onClick: onPreviewCommit,
    },
    {
      label: "Branch from this Version",
      icon: <GitBranch size={14} />,
      onClick: onBranchFromCommit,
    },
  ];

  if (onDeleteCommit) {
    items.push({
      label: "Delete Version from Project",
      icon: <Trash2Icon size={14} />,
      onClick: onDeleteCommit,
      danger: true,
    });
  }

  return items;
};
