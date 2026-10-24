import legacy from './entrances.json';
import added from './added-entrances.json';
import type {Entrance} from '../domain/types';
export const entrances=[...legacy,...added] as Entrance[];
