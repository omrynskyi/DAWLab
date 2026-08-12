import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActivityPanel } from '../ActivityPanel';

vi.mock('@/utils/versionCheck', () => ({
    checkVersion: vi.fn().mockResolvedValue({ isOutdated: false, currentVersion: '1.0.0', latestVersion: '1.0.0' }),
}));

describe('ActivityPanel', () => {
    it('renders nothing when no version update', () => {
        const { container } = render(<ActivityPanel />);
        expect(container.firstChild).toBeNull();
    });

    it('renders version notification when outdated', async () => {
        const { checkVersion } = await import('@/utils/versionCheck');
        (checkVersion as any).mockResolvedValue({ isOutdated: true, currentVersion: '1.0.0', latestVersion: '1.1.0' });

        const { findByText } = render(<ActivityPanel />);
        const updateText = await findByText(/Update available/i);
        expect(updateText).toBeInTheDocument();
    });
});
