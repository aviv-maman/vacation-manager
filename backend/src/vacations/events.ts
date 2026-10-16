export interface VacationEvent {
  type:
    "VacationRequestCreatedEvent" | "VacationRequestApprovedEvent" | "VacationRequestRejectedEvent";
  requestId: number;
  userId: number;
  actorId: number;
  occurredAt: string;
}

type EventHandler = (event: Readonly<VacationEvent>) => void | Promise<void>;

function logVacationEvent(event: Readonly<VacationEvent>): void {
  console.info(JSON.stringify(event));
}

export class BusinessEventPublisher {
  constructor(private readonly handlers: readonly EventHandler[] = [logVacationEvent]) {}

  async publish(event: VacationEvent): Promise<void> {
    for (const handle of this.handlers) {
      try {
        await handle(event);
      } catch {
        // Events run after commit. A failed listener or logger must not fail the request.
        try {
          console.error(
            JSON.stringify({
              type: "BusinessEventHandlerFailed",
              eventType: event.type,
              requestId: event.requestId,
            }),
          );
        } catch {
          // Even an unavailable logging sink cannot undo a committed operation.
        }
      }
    }
  }
}

export const businessEvents = new BusinessEventPublisher();
