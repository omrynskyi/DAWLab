import React from 'react';

export type ActionButtonVariant = 'primary' | 'save' | 'merge' | 'destructive';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionButtonVariant;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ 
  className = '', 
  variant, 
  children, 
  ...props 
}) => {
  const variantStyles = {
    primary: 'text-[#0094FF] hover:text-[#3db0ff]', // Blue (View Project, Invite)
    save: 'text-[#37E234] hover:text-[#5ff05c]',    // Green (Save)
    merge: 'text-[#E565FF] hover:text-[#ea85ff]',   // Purple (Merge)
    destructive: 'text-[#ef4444] hover:text-[#f87171]', // Red (Decline)
  };

  return (
    <button
      className={`font-medium transition-colors whitespace-nowrap ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
