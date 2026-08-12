import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Layout } from '../Layout/Layout';

// Mock child components to isolate Layout test
vi.mock('../ActivityPanel', () => ({
    ActivityPanel: () => <div>Mock ActivityPanel</div>
}));
vi.mock('../PreviewNotification', () => ({
    PreviewNotification: () => null
}));
vi.mock('react-router-dom', () => ({
    useLocation: () => ({ pathname: '/' })
}));
vi.mock('motion/react', () => ({
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>
    }
}));

describe('Layout', () => {
    it('renders children and layout components', () => {
        render(
            <Layout>
                <div data-testid="child-content">Child Content</div>
            </Layout>
        );

        expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
});
