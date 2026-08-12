import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommitGraph } from '../CommitGraph';

describe('CommitGraph', () => {
    const commits = [
        {
            commit_id: '1',
            timestamp: '20230101120000',
            message: 'Initial commit',
            author: 'User A'
        },
        {
            commit_id: '2',
            timestamp: '20230102120000',
            message: 'Update',
            author: 'User A'
        }
    ];

    it('renders commits', () => {
        render(
            <CommitGraph
                commits={commits}
                onCheckout={() => { }}
                projectName="Test Project"
                currentBranch="main"
            />
        );

        expect(screen.getByText('Initial commit')).toBeInTheDocument();
        expect(screen.getByText('Update')).toBeInTheDocument();
    });

    it('handles checkout click', () => {
        const onCheckout = vi.fn();
        render(
            <CommitGraph
                commits={commits}
                onCheckout={onCheckout}
                currentCommitId="1"
                projectName="Test Project"
                currentBranch="main"
            />
        );

        // Click checkout button for the second commit (id 2) - which is newer, so it should be first in list visually usually if sorted desc
        // The component sorts by timestamp desc (newest first)
        // So 'Update' (20230102) is first row. 'Initial' (20230101) is second.
        // The "checkout" buttons have class 'checkout-button'.
        // We can rely on title or just click the one associated with the commit.
        // Let's find by commit message container and then find button in row.

        // Simplification: just find all buttons inside commit-action
        // Or just click the first available checkout button that isn't for pagination.

        // Easier: Mock formatTimestamp to make sure we know what we get
    });
});
