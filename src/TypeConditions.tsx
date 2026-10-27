export default function TypeConditions({types,selected,onChange}:{types:string[];selected:string[]|null;onChange:(types:string[]|null)=>void}){
 const active=selected??types;
 return <section className="type-conditions" aria-label="列車の条件"><h2>乗りたい種別</h2><p>複数選べます。現在：<strong>{selected===null?'全種別':selected.length?selected.join('・'):'種別未選択'}</strong></p>
 <div className="type-checks">{types.map(type=><label key={type}><input type="checkbox" checked={active.includes(type)} onChange={()=>onChange(active.includes(type)?active.filter(t=>t!==type):[...active,type])}/>{type}</label>)}</div>
 {!types.length&&<p>この日・方面の種別情報をまだ確認できていません。</p>}
 <button onClick={()=>onChange(null)}>全種別に戻す</button><p className="condition-note">駅・方面・平日・土曜・休日ごとに保存します。種別不明も個別に選べます。料金・停車駅・到着の早さは確認していません。</p></section>;
}
