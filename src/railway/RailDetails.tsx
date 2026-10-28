import type {ReactNode} from 'react';
export default function RailDetails({active,title,children}:{active:boolean;title:string;children:ReactNode}){
 return active?<details className="rail-help-summary"><summary>{title}</summary>{children}</details>:<>{children}</>;
}
