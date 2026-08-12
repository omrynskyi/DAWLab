import { render } from '@testing-library/react';
import { describe, it, vi, beforeEach } from 'vitest';

describe('Particles', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.doMock('ogl', () => {
            return {
                Renderer: class {
                    gl = {
                        canvas: document.createElement('canvas'),
                        clearColor: () => { },
                    };
                    setSize = () => { };
                    render = () => { };
                },
                Camera: class {
                    position = { set: () => { } };
                    perspective = () => { };
                },
                Geometry: class { },
                Program: class {
                    uniforms = {
                        uTime: { value: 0 }
                    }
                },
                Mesh: class {
                    position = { x: 0, y: 0 };
                    rotation = { x: 0, y: 0, z: 0 };
                },
            };
        });
    });

    it('renders without crashing', async () => {
        // Dynamic import to ensure mock is applied
        const { default: Particles } = await import('../Particles');
        render(<Particles />);
    });
});
