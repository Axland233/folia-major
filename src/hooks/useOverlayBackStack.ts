import { useEffect } from 'react';
import { pushOverlayBackEntry, removeOverlayBackEntry } from './useAppNavigation';

// src/hooks/useOverlayBackStack.ts

/**
 * React hook that registers/unregisters an overlay on the mobile-friendly
 * back stack. When the overlay becomes active it pushes a back entry; when
 * the user presses the hardware back button the overlay is popped (closed)
 * before any view-level navigation happens.
 */
export function useOverlayBackStack(overlayId: string, isActive: boolean, onBack: () => void) {
    useEffect(() => {
        if (!isActive) return;

        pushOverlayBackEntry({ id: overlayId, pop: onBack });
        return () => { removeOverlayBackEntry(overlayId); };
    }, [overlayId, isActive, onBack]);
}
