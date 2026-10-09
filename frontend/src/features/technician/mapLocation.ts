import type { Store } from '../../types/models'

export type MapLocation = Pick<Store, 'id' | 'name' | 'address' | 'latitude' | 'longitude'>
