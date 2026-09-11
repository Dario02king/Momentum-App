import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The one boundary around the 3D body.
 *
 * Two failures it exists for, and both end the same way: the chunk cannot be
 * fetched at all (offline, a cache that no longer holds it), and the viewer
 * throws after it has mounted (a lost context, a model that violates its
 * contract). Either way the body is replaced by the SVG figure and the rest
 * of the Gym screen — the rows, the charts, the exercises — keeps working.
 *
 * Deliberately local and deliberately small: the app has no global error
 * infrastructure, and a 3D body is exactly the kind of optional surface that
 * should not be able to take a screen down with it.
 */
export class BodyBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; onError?: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing is reported anywhere — the app has no telemetry — but a
    // developer with a console open should not have to guess.
    console.error('body viewer failed, showing the flat figure instead', error, info);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
