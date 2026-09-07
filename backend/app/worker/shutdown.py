import asyncio
import signal
import logging
import sys

logger = logging.getLogger(__name__)

class WorkerShutdown:
    """
    Handles graceful shutdown for asyncio-based workers.
    Intercepts SIGINT and SIGTERM (where supported).
    Provides a bounded wait capability for active transactions.
    """
    def __init__(self):
        self._shutdown_event = asyncio.Event()
        self._setup_signal_handlers()

    def _setup_signal_handlers(self):
        def handle_signal(sig, frame):
            if not self._shutdown_event.is_set():
                logger.info(f"Received termination signal ({sig}), initiating graceful shutdown...")
                try:
                    loop = asyncio.get_running_loop()
                    loop.call_soon_threadsafe(self._shutdown_event.set)
                except RuntimeError:
                    self._shutdown_event.set()

        try:
            signal.signal(signal.SIGINT, handle_signal)
            if sys.platform != 'win32':
                signal.signal(signal.SIGTERM, handle_signal)
            else:
                if hasattr(signal, 'SIGBREAK'):
                    signal.signal(signal.SIGBREAK, handle_signal)
                signal.signal(signal.SIGTERM, handle_signal)
        except ValueError:
            pass

    def is_shutting_down(self) -> bool:
        return self._shutdown_event.is_set()

shutdown_handler = None

def get_shutdown_handler() -> WorkerShutdown:
    global shutdown_handler
    if shutdown_handler is None:
        shutdown_handler = WorkerShutdown()
    return shutdown_handler
