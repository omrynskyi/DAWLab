import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContextMenu } from '../ContextMenu';

describe('ContextMenu', () => {
    it('renders items and handles clicks', () => {
        const onClick = vi.fn();
        const items = [
            { label: 'Item 1', onClick },
            { label: 'Item 2', onClick: () => { }, danger: true }
        ];

        render(
            <ContextMenu x={100} y={100} items={items} />
        );

        expect(screen.getByText('Item 1')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Item 1'));
        expect(onClick).toHaveBeenCalled();
    });
});
