export type Coordinates = { latitude: number; longitude: number; accuracy?: number }
export type TaskResult = 'conforme' | 'no_conforme'
export type TaskEvidence = { id: string; responseItemId: number; objectUrl: string; mimeType: string; size: number }
export type ChecklistAnswer = { responseItemId: number; result?: TaskResult; observation?: string; evidence?: TaskEvidence }
export type CompletionPayload = { coordinates: Coordinates; answers: ChecklistAnswer[]; storeCoordinates?: Coordinates }
export type CompletionResult = { status: 'completada' | 'fuera_radio'; simulated: true; distanceMeters: number; allowedRadiusMeters: number; withinRadius: boolean }
export type LocationFailure = 'denied' | 'timeout' | 'unavailable'
