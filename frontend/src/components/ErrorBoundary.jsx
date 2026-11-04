import { Component } from 'react';

// Catches a crash while drawing a page, so people see a helpful screen instead of a blank white one.
// It clears itself when they navigate elsewhere (resetKey changes).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error) {
    // Logged for the developer console only; nothing technical is ever shown to the person.
    console.error('[ErrorBoundary]', error);
  }

  componentDidUpdate(previous) {
    if (this.state.crashed && previous.resetKey !== this.props.resetKey) this.setState({ crashed: false });
  }

  render() {
    return this.state.crashed ? this.props.fallback : this.props.children;
  }
}
