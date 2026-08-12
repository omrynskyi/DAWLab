import { useEffect, RefObject } from 'react';

/**
 * Hook that handles clicking outside of a referenced element
 * @param ref - React ref to the element to detect clicks outside of
 * @param handler - Callback function to call when clicking outside
 * @param enabled - Optional flag to enable/disable the listener (default: true)
 */
export function useClickOutside<T extends HTMLElement>(
    ref: RefObject<T>,
    handler: () => void,
    enabled: boolean = true
) {
    useEffect(() => {
        if (!enabled) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                handler();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [ref, handler, enabled]);
}
