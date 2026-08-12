import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProjectCard } from '../ProjectCard-AudioLib';
import { BrowserRouter } from 'react-router-dom';

// Mock motion/react
vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        h3: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
        p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
        a: ({ children, ...props }: any) => <a {...props}>{children}</a>,
        svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('ProjectCard', () => {
    const cards = [
        {
            title: 'Test Card 1',
            description: 'Description 1',
            src: 'image1.jpg',
            ctaText: 'Action 1',
            ctaLink: '/link1',
            content: <p>Content 1</p>
        }
    ];

    it('renders cards correctly', () => {
        render(
            <BrowserRouter>
                <ProjectCard cards={cards} />
            </BrowserRouter>
        );

        expect(screen.getByText('Test Card 1')).toBeInTheDocument();
        expect(screen.getByText('Description 1')).toBeInTheDocument();
    });

    it('expands card on click', () => {
        render(
            <BrowserRouter>
                <ProjectCard cards={cards} />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByText('Test Card 1'));
        // Checks for expanded content
        expect(screen.getByText('Content 1')).toBeInTheDocument();
    });
});
