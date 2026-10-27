export default function ButtonIcon({kind}:{kind:'search'|'next'|'reset'|'list'}){
 return <svg className="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='search'?<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>:kind==='next'?<><path d="M4 12h14m-5-5 5 5-5 5M21 5v14"/></>:kind==='reset'?<><path d="M4 9a8 8 0 1 1 1 9M4 3v6h6M12 7v5l3 2"/></>:<><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>}</svg>;
}
