import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InputModal } from '../InputModal';

describe('InputModal', () => {
    it('renders correctly', () => {
        render(
            <InputModal
                isOpen={true}
                title="Test Modal"
                label="Test Label"
                value=""
                onChange={() => { }}
                onSubmit={() => { }}
                onClose={() => { }}
            />
        );
        expect(screen.getByText('Test Label')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
    });

    it('calls onChange when input changes', () => {
        const onChange = vi.fn();
        render(
            <InputModal
                isOpen={true}
                title="Test Modal"
                label="Test Label"
                value=""
                onChange={onChange}
                onSubmit={() => { }}
                onClose={() => { }}
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Enter value'), { target: { value: 'New Value' } });
        expect(onChange).toHaveBeenCalledWith('New Value');
    });

    it('calls onSubmit when form is submitted', () => {
        const onSubmit = vi.fn();
        render(
            <InputModal
                isOpen={true}
                title="Test Modal"
                label="Test Label"
                value="val"
                onChange={() => { }}
                onSubmit={onSubmit}
                onClose={() => { }}
            />
        );

        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!);
        expect(onSubmit).toHaveBeenCalled();
    });
});
