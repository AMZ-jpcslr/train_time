export type JrScope = {
 schemaVersion:1; scopeVersion:2; operator:'JR西日本'; sourceOrigin:string;
 acquisitionScope:'existing'; reusePermission:'unresolved-existing'; qualityReview:string;
 corridors:{id:string;name:string}[];
 stations:{id:string;name:string;eid:string;routes:{directionId:string;corridorId:string;sourceLine:string;direction:string}[]}[];
};
export function validateJrScope(value:unknown):JrScope;
export const JR_SCOPE:Readonly<JrScope>;
export const JR_SCOPE_VERSION:2;
export const JR_STATIONS:readonly {readonly id:string;readonly name:string;readonly eid:string;readonly routes:readonly (readonly [string,string,string])[]}[];
export const JR_DIRECTIONS:readonly {readonly key:string;readonly stationId:string;readonly directionId:string;readonly operator:string;readonly line:string;readonly direction:string;readonly corridorId:string}[];
export function expectedJrDirectionKeys():Set<string>;
export function isJrAcquisitionStation(stationId:string):boolean;
export function matchesJrDirection(value:unknown):boolean;
