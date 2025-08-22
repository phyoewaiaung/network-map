import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Tooltip,
  Popup,
  useMap,
  useMapEvent,
} from "react-leaflet";
import { DivIcon, LatLng } from "leaflet";
import type { Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

/** =========================
 * Types & Sample Data
 * =======================*/
type DeviceStatus = "available" | "connected" | "disabled";
type Device = {
  id: string;
  label: string;
  coords: [number, number]; // [lng, lat]
  status: DeviceStatus;
  width: number;
  height: number;
};
type LinkStyle = "straight" | "curved" | "custom";
type Link = {
  source: string;
  target: string;
  style: LinkStyle;
  waypoints?: [number, number][]; // [lat,lng]
  curvy?: boolean; // when custom: true = spline, false = straight segments
};

const sampleData: { devices: Device[]; links: Link[] } = {
  devices: [
    { id: "a", label: "Bangkok",  coords: [100.5018, 13.7563], status: "available", width: 0, height: 0 },
    { id: "b", label: "Tokyo",    coords: [139.6917, 35.6895], status: "connected", width: 0, height: 0 },
    { id: "c", label: "Paris",    coords: [2.3522, 48.8566],   status: "available", width: 0, height: 0 },
    { id: "d", label: "New York", coords: [-74.006, 40.7128],  status: "disabled",  width: 0, height: 0 },
  ],
  links: [
    { source: "a", target: "b", style: "straight" },
    { source: "b", target: "c", style: "curved" },
    { source: "a", target: "c", style: "straight" },
    { source: "c", target: "d", style: "custom", waypoints: [[45, 10]], curvy: false },
  ],
};

/** =========================
 * Styling (desktop-ish, no scroll)
 * =======================*/
const css = `
:root{
  --surface:#fff; --text:#111827; --muted:#4b5563;
  --border:#d1d5db; --border-strong:#9ca3af;
  --accent:#2563eb; --danger:#dc2626;
  --chip-shadow:0 1px 2px rgba(0,0,0,.08);
}

/* === Leaflet popup resets so content never overflows === */
.leaflet-popup-content-wrapper{ padding:0 !important; border-radius:6px; }
.leaflet-popup-content{ margin:0 !important; width:auto !important; }
.leaflet-popup-close-button{ top:6px; right:6px; }

/* === Device chip (unchanged, a bit smaller) === */
.device-chip{
  --bg:#2b8a3e; --w:auto; --h:auto; --border:1px solid rgba(0,0,0,.08);
  display:inline-flex; align-items:center; gap:6px; background:var(--bg); color:#fff;
  border-radius:999px; padding:4px 10px; font:12px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  box-shadow:var(--chip-shadow); width:var(--w); height:var(--h); border:var(--border); user-select:none;
}
.device-chip .dot{ width:7px; height:7px; border-radius:50%; background:#7CFC00; }
.leaflet-tooltip.my-tip{ background:#111827; color:#fff; border:1px solid rgba(0,0,0,.3); border-radius:6px; padding:4px 6px; font:12px/1.2 system-ui; }

/* === Desktop dialog container === */
.popup-card{
  width:420px; max-width:420px;
  background:var(--surface); color:var(--text);
  border:1px solid var(--border); border-radius:6px; overflow:hidden;
  font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
.popup-header{
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 10px; border-bottom:1px solid var(--border); background:#f9fafb;
}
.popup-title{ font-weight:700; font-size:13px; color:#111827; }

/* === Compact two‑column form (no gaps/overflow) === */
form.form{
  display:grid;
  grid-template-columns: 96px minmax(0,1fr); /* tighter label column */
  gap:6px 10px;
  padding:10px;
}
form.form label{ color:#374151; font-weight:600; font-size:12px; align-self:center; }

/* normalize controls */
input[type="text"], input[type="number"], select{
  height:28px; padding:4px 8px; font-size:13px;
  border:1px solid var(--border); border-radius:4px; background:#fff;
  outline:0; width:100%; min-width:0;  /* prevent overflow */
}
input:focus, select:focus{ border-color:var(--accent); box-shadow:0 0 0 2px rgba(37,99,235,.15); }

/* status as segmented control */
.status-pills{ display:inline-flex; border:1px solid var(--border); border-radius:4px; overflow:hidden; height:28px; }
.status-pills .pill{
  background:#f3f4f6; border:0; padding:0 10px; font-weight:600; cursor:pointer;
  color:#374151; height:100%; white-space:nowrap;
}
.status-pills .pill + .pill{ border-left:1px solid var(--border); }
.status-pills .active{ background:#e5efff; color:#1d4ed8; }

/* inline helpers */
.inline{ display:flex; align-items:center; gap:8px; min-width:0; }
.inline.nowrap{ white-space:nowrap; }
.size-input{ width:88px; }

/* separators & actions */
.sep{ grid-column:1/-1; height:1px; background:var(--border); margin:4px 0; }
.actions{ grid-column:1/-1; display:flex; justify-content:flex-end; gap:8px; padding-top:6px; border-top:1px solid var(--border); }

/* === Links list: compact row items that don't overflow === */
.pill-row{ grid-column:2/-1; display:flex; flex-direction:column; gap:6px; }
.link-pill{
  display:flex; flex-wrap:wrap; align-items:center; gap:6px;
  padding:6px; border:1px solid var(--border); border-radius:4px; background:#fff;
  min-height:28px;
}
.link-pill select{ flex:0 0 auto; max-width:160px; }
.link-pill .btn{ flex:0 0 auto; }
.link-pill > span{ white-space:nowrap; color:#6b7280; }

/* buttons */
.btn{
  border:1px solid var(--border-strong); background:#f3f4f6; color:#111827;
  border-radius:4px; padding:5px 10px; cursor:pointer; font-weight:600; height:28px; white-space:nowrap;
}
.btn:hover{ background:#e5e7eb; }
.btn:active{ background:#e2e4e7; }
.btn-primary{ background:#2563eb; border-color:#2563eb; color:#fff; }
.btn-primary:hover{ background:#1d4ed8; }
.btn-danger{ background:#dc2626; border-color:#dc2626; color:#fff; }
.btn-danger:hover{ background:#b91c1c; }

/* waypoint handle */
.handle{ width:12px; height:12px; border-radius:50%; border:2px solid #111827; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); }

/* tips card */
.tips{ position:absolute; left:12px; top:12px; z-index:9999; background:#fff; border:1px solid var(--border); border-radius:6px; padding:8px 10px; font:12px/1.3 system-ui; }
.tips h4{ margin:0 0 4px 0; font:600 12px system-ui; }
.tips ul{ margin:4px 0 0 16px; padding:0; }
`;



/** =========================
 * Helpers
 * =======================*/
const STATUS_COLORS: Record<DeviceStatus, string> = {
  available: "#22c55e",
  connected: "#2563eb",
  disabled:  "#9ca3af",
};
function makeDeviceIcon(d: Device, selected: boolean) {
  const border = selected ? "2px solid #f59e0b" : "0px solid transparent";
  const bg = STATUS_COLORS[d.status];
  const dotColor = d.status === "disabled" ? "#cbd5e1" : "#86efac";
  return new DivIcon({
    className: "device-icon",
    html: `
      <div class="device-chip" style="
        --bg:${bg};
        --w:${d.width>0?d.width+"px":"auto"};
        --h:${d.height>0?d.height+"px":"auto"};
        --border:${border};
        opacity:${d.status==="disabled"?0.7:1};
      ">
        <span class="dot" style="background:${dotColor}"></span>
        <span class="label">${d.label}</span>
      </div>
    `,
    iconSize: [1,1], iconAnchor: [0,0],
  });
}
function makeWaypointIcon(){ return new DivIcon({ className:"", html:`<div class="handle"></div>`, iconSize:[12,12], iconAnchor:[6,6] }); }

/** geometry */
function curvedPath(a:[number,number], b:[number,number], segments=28, curvature=0.28):[number,number][]{
  const [alat, alng] = a, [blat, blng] = b;
  const mid:[number,number] = [(alat+blat)/2,(alng+blng)/2];
  const vx=blat-alat, vy=blng-alng;
  let px=-vy, py=vx; const plen=Math.hypot(px,py)||1; px/=plen; py/=plen;
  const d=Math.hypot(vx,vy), k=d*curvature, cx=mid[0]+px*k, cy=mid[1]+py*k;
  const out:[number,number][]=[]; for(let i=0;i<=segments;i++){ const t=i/segments, omt=1-t;
    out.push([omt*omt*alat + 2*omt*t*cx + t*t*blat, omt*omt*alng + 2*omt*t*cy + t*t*blng]);
  } return out;
}
function catmullRomSpline(points:[number,number][], samplesPerSeg=14):[number,number][]{
  if(points.length<=2) return points.slice();
  const P=[points[0],...points,points[points.length-1]], out:[number,number][]=[];
  for(let i=0;i<P.length-3;i++){ const p0=P[i], p1=P[i+1], p2=P[i+2], p3=P[i+3];
    for(let j=0;j<samplesPerSeg;j++){ const t=j/samplesPerSeg, t2=t*t, t3=t2*t;
      const lat=0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3);
      const lng=0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3);
      out.push([lat,lng]);
    }
  } out.push(points[points.length-1]); return out;
}
function nearestSegmentIndex(vertices:[number,number][], p:[number,number]){
  let bestI=0, bestD=Infinity;
  for(let i=0;i<vertices.length-1;i++){
    const a=vertices[i], b=vertices[i+1];
    const ax=a[0], ay=a[1], bx=b[0], by=b[1], px=p[0], py=p[1];
    const vx=bx-ax, vy=by-ay, wx=px-ax, wy=py-ay; const vv=vx*vx+vy*vy||1e-9;
    let t=(vx*wx+vy*wy)/vv; t=Math.max(0,Math.min(1,t));
    const cx=ax+t*vx, cy=ay+t*vy, d=(px-cx)*(px-cx)+(py-cy)*(py-cy);
    if(d<bestD){ bestD=d; bestI=i; }
  } return bestI;
}

/** map helpers */
function GraphPanOverlay({ onPanBy }:{ onPanBy:(dx:number,dy:number)=>void }){
  const ref=useRef<HTMLDivElement|null>(null); const dragging=useRef(false); const last=useRef<{x:number;y:number}|null>(null); const [pe,setPe]=useState<"none"|"auto">("none");
  useEffect(()=>{ const el=ref.current; if(!el) return;
    const onDown=(e:MouseEvent)=>{ if(e.button!==0) return; dragging.current=true; last.current={x:e.clientX,y:e.clientY}; setPe("auto"); e.preventDefault(); };
    const onMove=(e:MouseEvent)=>{ if(!dragging.current||!last.current) return; const dx=e.clientX-last.current.x, dy=e.clientY-last.current.y; if(dx||dy){ onPanBy(-dx,-dy); last.current={x:e.clientX,y:e.clientY}; } };
    const onUp=()=>{ dragging.current=false; last.current=null; setPe("none"); };
    el.addEventListener("mousedown",onDown); window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
    return ()=>{ el.removeEventListener("mousedown",onDown); window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
  },[onPanBy]);
  return <div ref={ref} style={{position:"absolute", inset:0, background:"transparent", pointerEvents:pe}}/>;
}
function PanBridge({ setPanBy }:{ setPanBy:(fn:(dx:number,dy:number)=>void)=>void }){ const map=useMap(); useEffect(()=>{ setPanBy((dx,dy)=>map.panBy([dx,dy],{animate:false})); },[map,setPanBy]); return null; }
function MapDragDisabler({ active }:{active:boolean}){ const map=useMap(); useEffect(()=>{ active?map.dragging.disable():map.dragging.enable(); return ()=>map.dragging.enable(); },[active,map]); return null; }
function DoubleClickToAdd({ onAdd }:{ onAdd:(ll:LatLng)=>void }){ const map=useMap(); useMapEvent("dblclick",(e)=>onAdd(e.latlng)); useEffect(()=>{ map.doubleClickZoom.disable(); return ()=>map.doubleClickZoom.enable(); },[map]); return null; }
function ClosePopupOnMapClick({ onClick }:{ onClick:()=>void }){ useMapEvent("click",()=>onClick()); return null; }
function isFormTyping(){ const el=document.activeElement as HTMLElement|null; if(!el) return false; const tag=el.tagName.toLowerCase(); return tag==="input"||tag==="textarea"||(el as any).isContentEditable; }

/** =========================
 * Component
 * =======================*/
export function MapNetwork(){
  const [devices,setDevices]=useState<Device[]>(sampleData.devices);
  const [links,setLinks]=useState<Link[]>(sampleData.links);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [openPopupId,setOpenPopupId]=useState<string|null>(null);

  const markerRefs=useRef<Record<string,LeafletMarker|null>>({});
  const panByRef=useRef<(dx:number,dy:number)=>void>(()=>{});
  const setPanBy=(fn:(dx:number,dy:number)=>void)=>(panByRef.current=fn);

  const [editingLink,setEditingLink]=useState<{source:string;target:string}|null>(null);
  const [draggingWp,setDraggingWp]=useState<{source:string;target:string;index:number}|null>(null);

  const [popupDraft,setPopupDraft]=useState<{id:string|null;label:string;status:DeviceStatus;width:number;height:number;linkTargetId:string|""}>({id:null,label:"",status:"available",width:0,height:0,linkTargetId:""});
  const nextId=useRef(1);

  const findDevice=(id:string)=>devices.find(d=>d.id===id);
  const findLink=(s:string,t:string)=>links.find(l=>l.source===s&&l.target===t);
  const closeOtherPopups=(keep:string)=>Object.entries(markerRefs.current).forEach(([id,m])=>{ if(id!==keep) m?.closePopup(); });
  const openPopupWhenReady=(id:string)=>{ const ref=markerRefs.current[id]; if(ref){ closeOtherPopups(id); ref.openPopup(); setOpenPopupId(id); setSelectedId(id); const d=findDevice(id)!; setPopupDraft({ id:d.id,label:d.label,status:d.status,width:d.width,height:d.height,linkTargetId:"" }); } };

  const addNodeAt=(ll:LatLng)=>{ const id=`n${nextId.current++}`; const dev:Device={id,label:`Node ${id}`,coords:[ll.lng,ll.lat],status:"available",width:0,height:0}; setDevices(p=>[...p,dev]); setTimeout(()=>openPopupWhenReady(id),0); };
  const updateDevice=(id:string,patch:Partial<Device>)=>setDevices(p=>p.map(d=>d.id===id?{...d,...patch}:d));
  const removeDevice=(id:string)=>{ markerRefs.current[id]?.closePopup(); setOpenPopupId(c=>c===id?null:c); setSelectedId(c=>c===id?null:c); setDevices(p=>p.filter(d=>d.id!==id)); setLinks(p=>p.filter(l=>l.source!==id && l.target!==id)); delete markerRefs.current[id]; if(editingLink && (editingLink.source===id||editingLink.target===id)) setEditingLink(null); };
  const addLink=(s:string,t:string)=> setLinks(p=> p.some(e=>e.source===s&&e.target===t)?p:[...p,{source:s,target:t,style:"straight",waypoints:[]}]);
  const setLinkStyle=(s:string,t:string,style:LinkStyle)=>setLinks(p=>p.map(l=>l.source===s&&l.target===t?{...l,style}:l));
  const setLinkCurvy=(s:string,t:string,curvy:boolean)=>setLinks(p=>p.map(l=>l.source===s&&l.target===t?{...l,curvy}:l));
  const setLinkWaypoints=(s:string,t:string,wps:[number,number][])=>setLinks(p=>p.map(l=>l.source===s&&l.target===t?{...l,waypoints:wps}:l));
  const removeLink=(s:string,t:string)=>{ setLinks(p=>p.filter(l=>!(l.source===s&&l.target===t))); if(editingLink && editingLink.source===s && editingLink.target===t) setEditingLink(null); };

  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape"&&editingLink){ setEditingLink(null); setDraggingWp(null);} if(!selectedId||isFormTyping())return; if(e.key==="Delete"||e.key==="Backspace"){ e.preventDefault(); removeDevice(selectedId);} }; window.addEventListener("keydown",onKey); return ()=>window.removeEventListener("keydown",onKey); },[selectedId,editingLink]);

  const linkVertices=(l:Link):[number,number][]=>(()=>{ const a=findDevice(l.source)!, b=findDevice(l.target)!; const A:[number,number]=[a.coords[1],a.coords[0]], B:[number,number]=[b.coords[1],b.coords[0]]; return [A, ...(l.waypoints??[]), B]; })();
  const insertWp=(l:Link,ll:[number,number])=>{ const verts=linkVertices(l); const seg=nearestSegmentIndex(verts,ll); const wps=(l.waypoints??[]).slice(); wps.splice(seg,0,ll); setLinkWaypoints(l.source,l.target,wps); return seg; };
  const seedFromCurve=(l:Link,samples=10)=>{ const a=findDevice(l.source), b=findDevice(l.target); if(!a||!b) return; const curve=curvedPath([a.coords[1],a.coords[0]],[b.coords[1],b.coords[0]],36,0.28); const inner=curve.slice(1,-1); const step=Math.max(1,Math.floor(inner.length/samples)); setLinkWaypoints(l.source,l.target, inner.filter((_,i)=>i%step===0) as [number,number][] ); };

  const renderedLinks=useMemo(()=>links.map((l,i)=>{
    const a=findDevice(l.source), b=findDevice(l.target); if(!a||!b) return null;
    const isEditing=!!editingLink && editingLink.source===l.source && editingLink.target===l.target;
    const A:[number,number]=[a.coords[1],a.coords[0]], B:[number,number]=[b.coords[1],b.coords[0]];
    let positions:[number,number][];
    if(l.style==="straight") positions=[A,B];
    else if(l.style==="curved") positions=curvedPath(A,B,28,0.28);
    else { const ctrl=[A, ...(l.waypoints??[]), B]; positions=l.curvy?catmullRomSpline(ctrl,14):ctrl; }

    const onContextMenu=(e:any)=>{ if(l.style==="curved"){ setLinkStyle(l.source,l.target,"custom"); setLinkCurvy(l.source,l.target,true); seedFromCurve(l); } else if(l.style==="straight"){ setLinkStyle(l.source,l.target,"custom"); setLinkCurvy(l.source,l.target,false); if(!l.waypoints) setLinkWaypoints(l.source,l.target,[]);} setEditingLink({source:l.source,target:l.target}); e.originalEvent?.preventDefault?.(); e.originalEvent?.stopPropagation?.(); };
    const onClick=(e:any)=>{ const active=editingLink&&editingLink.source===l.source&&editingLink.target===l.target; if(active && (findLink(l.source,l.target)?.style==="custom")){ const ll:[number,number]=[e.latlng.lat,e.latlng.lng]; insertWp(l,ll); e.originalEvent?.preventDefault?.(); e.originalEvent?.stopPropagation?.(); } };
    const onMouseDown=(e:any)=>{ const active=editingLink&&editingLink.source===l.source&&editingLink.target===l.target; if(active && (findLink(l.source,l.target)?.style==="custom")){ const ll:[number,number]=[e.latlng.lat,e.latlng.lng]; const idx=insertWp(l,ll); setDraggingWp({source:l.source,target:l.target,index:idx}); e.originalEvent?.preventDefault?.(); e.originalEvent?.stopPropagation?.(); } };

    return <Polyline key={`L-${i}`} positions={positions} pathOptions={{weight:3,opacity:isEditing?1:0.95,color:isEditing?"#f59e0b":"#2563eb",dashArray:isEditing?"6 4":undefined}} eventHandlers={{contextmenu:onContextMenu, click:onClick, mousedown:onMouseDown}}/>;
  }),[links,devices,editingLink]);

  function WaypointDragOverlay(){
    useMapEvent("mousemove",(e)=>{ if(!draggingWp) return; const {source,target,index}=draggingWp; const l=findLink(source,target); if(!l||l.style!=="custom") return; const wps=(l.waypoints??[]).slice(); if(!wps[index]) return; wps[index]=[e.latlng.lat,e.latlng.lng]; setLinkWaypoints(source,target,wps); });
    useMapEvent("mouseup",()=>{ if(draggingWp) setDraggingWp(null); });
    useMapEvent("contextmenu",()=>{ if(editingLink){ setEditingLink(null); setDraggingWp(null); } });
    return null;
  }
  function LinkPathEditor(){
    const active=editingLink?findLink(editingLink.source,editingLink.target):null;
    if(!active||active.style!=="custom") return null;
    return (<>{(active.waypoints??[]).map((pt,i)=>(
      <Marker key={`wp-${i}`} position={[pt[0],pt[1]]} icon={makeWaypointIcon()} draggable
        eventHandlers={{
          dragstart:()=>setDraggingWp({source:active.source,target:active.target,index:i}),
          dragend:(e:any)=>{ const ll=e.target.getLatLng() as LatLng; const nw=[...(active.waypoints??[])]; nw[i]=[ll.lat,ll.lng]; setLinkWaypoints(active.source,active.target,nw); setDraggingWp(null); },
          click:(e:any)=>{ if(e.originalEvent?.altKey){ setLinkWaypoints(active.source,active.target,(active.waypoints??[]).filter((_,j)=>j!==i)); } }
        }}
      />
    ))}</>);
  }

  const [showTips,setShowTips]=useState(true);

  return (
    <div style={{position:"relative",height:"100vh",width:"100vw"}}>
      <style>{css}</style>

      <div className="tips">
        <h4>Tips</h4>
        {showTips && (
          <ul>
            <li><b>Double-click</b> map → add node.</li>
            <li><b>Right-click</b> a link → Edit (curved stays curvy; straight stays straight).</li>
            <li>While editing: click/drag to add & move points; <code>Alt+Click</code> a handle to delete.</li>
            <li>Finish editing: <code>Esc</code> or right-click map.</li>
          </ul>
        )}
        <button className="btn" onClick={()=>setShowTips(!showTips)}>{showTips?"Hide":"Show"}</button>
      </div>

      <MapContainer center={[20,0]} zoom={3} minZoom={2} scrollWheelZoom style={{height:"100%",width:"100%"}} maxBounds={[[-85,-180],[85,180]]} maxBoundsViscosity={1.0} worldCopyJump={false}>
        <MapDragDisabler active={!!draggingWp}/>
        <PanBridge setPanBy={(fn)=>setPanBy(fn)}/>
        <DoubleClickToAdd onAdd={addNodeAt}/>
        <ClosePopupOnMapClick onClick={()=>{ if(openPopupId){ Object.values(markerRefs.current).forEach(m=>m?.closePopup()); setOpenPopupId(null);} setSelectedId(null); setPopupDraft(d=>({...d,id:null})); }}/>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" noWrap/>

        {renderedLinks}
        <LinkPathEditor/>
        <WaypointDragOverlay/>

        {devices.map((d)=>{
          const isSelected=selectedId===d.id;
          const icon=makeDeviceIcon(d,isSelected);
          const incident=links.filter(l=>l.source===d.id||l.target===d.id);

          return (
            <Marker key={d.id} position={[d.coords[1],d.coords[0]]} icon={icon} draggable
              ref={(ref)=>{ markerRefs.current[d.id]=ref; }}
              eventHandlers={{
                click:()=>{ setSelectedId(d.id); if(openPopupId && openPopupId!==d.id){ closeOtherPopups(d.id); setOpenPopupId(null);} },
                dblclick:(e)=>{ closeOtherPopups(d.id); openPopupWhenReady(d.id); (e.target as any).openPopup(); },
                popupopen:()=>{ closeOtherPopups(d.id); setOpenPopupId(d.id); setPopupDraft({id:d.id,label:d.label,status:d.status,width:d.width,height:d.height,linkTargetId:""}); },
                popupclose:()=>{ if(openPopupId===d.id) setOpenPopupId(null); },
                dragend:(e:any)=>{ const ll=e.target.getLatLng() as LatLng; setDevices(p=>p.map(x=>x.id===d.id?{...x,coords:[ll.lng,ll.lat]}:x)); },
              }}
            >
              <Tooltip className="my-tip" direction="top" offset={[0,-8]}>{isSelected?`⭐ ${d.label}`:d.label}</Tooltip>

              <Popup
  className="native-dialog"
  maxWidth={440}
  closeOnClick={false}
  autoClose={false}
  closeButton
  keepInView
  autoPan
  autoPanPadding={[24,24]}
>

                <div className="popup-card">
                  <div className="popup-header">
                    <div className="popup-title">Edit “{popupDraft.id===d.id?popupDraft.label:d.label}”</div>
                    <button className="btn btn-danger" type="button" onClick={()=>removeDevice(d.id)}>Delete</button>
                  </div>

                  {/* one clean FORM, no internal scrolling */}
                  <form className="form"
                    onSubmit={(e)=>{ e.preventDefault(); if(popupDraft.id!==d.id) return; updateDevice(d.id,{label:popupDraft.label,status:popupDraft.status,width:popupDraft.width,height:popupDraft.height}); markerRefs.current[d.id]?.closePopup(); }}
                    onReset={(e)=>{ e.preventDefault(); setPopupDraft({id:d.id,label:d.label,status:d.status,width:d.width,height:d.height,linkTargetId:""}); }}
                  >
                    <label>Name</label>
                    <input type="text" value={popupDraft.id===d.id?popupDraft.label:d.label}
                      onChange={(e)=>{ if(popupDraft.id!==d.id) return; setPopupDraft({...popupDraft,label:e.target.value}); }}
                    />

                    <label>Status</label>
                    <div className="status-pills">
                      {(["available","connected","disabled"] as DeviceStatus[]).map(s=>(
                        <button key={s} type="button" className={"pill"+(((popupDraft.id===d.id?popupDraft.status:d.status)===s)?" active":"")}
                          onClick={()=>{ if(popupDraft.id!==d.id) return; setPopupDraft({...popupDraft,status:s}); }}>
                          {s}
                        </button>
                      ))}
                    </div>

                    <label>Size</label>
                    <div className="inline nowrap">
                      <input className="size-input" type="number" min={0} placeholder="W" value={popupDraft.id===d.id?popupDraft.width:d.width}
                        onChange={(e)=>{ if(popupDraft.id!==d.id)return; setPopupDraft({...popupDraft,width:Number(e.target.value)||0}); }}/>
                      <span style={{color:"#94a3b8"}}>×</span>
                      <input className="size-input" type="number" min={0} placeholder="H" value={popupDraft.id===d.id?popupDraft.height:d.height}
                        onChange={(e)=>{ if(popupDraft.id!==d.id)return; setPopupDraft({...popupDraft,height:Number(e.target.value)||0}); }}/>
                    </div>

                    <div className="sep"/>

                    <label>Link to</label>
                    <div className="inline nowrap" style={{gap:10}}>
                      <select value={popupDraft.id===d.id?popupDraft.linkTargetId:""} onChange={(e)=>{ if(popupDraft.id!==d.id)return; setPopupDraft({...popupDraft,linkTargetId:e.target.value}); }} style={{flex:1, minWidth:0}} >
                        <option value="">— choose node —</option>
                        {devices.filter(x=>x.id!==d.id).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                      <button className="btn btn-primary" type="button"
                        onClick={()=>{ if(popupDraft.id!==d.id || !popupDraft.linkTargetId) return; addLink(d.id,popupDraft.linkTargetId); setPopupDraft({...popupDraft,linkTargetId:""}); }}>
                        Add link
                      </button>
                    </div>

                    {incident.length>0 && (
                      <>
                        <div className="sep"/>
                        <label style={{alignSelf:"start"}}>Links</label>
                        <div className="pill-row" style={{gridColumn:"2 / -1"}}>
                          {incident.map((l,i)=>{
                            const otherId=l.source===d.id?l.target:l.source;
                            const dir=l.source===d.id?"→":"←";
                            const other=findDevice(otherId);
                            const style=l.style;
                            const isEditing=editingLink && editingLink.source===l.source && editingLink.target===l.target;

                            return (
                              <div className="link-pill" key={i}>
                                <span style={{opacity:.7}}>{dir}</span> {other?.label ?? otherId}

                                <select value={style} onChange={(e)=>{
                                  const ns=e.target.value as LinkStyle;
                                  if(ns==="straight"){ setLinkStyle(l.source,l.target,"straight"); setLinkWaypoints(l.source,l.target,[]); setLinkCurvy(l.source,l.target,false); if(isEditing) setEditingLink(null); }
                                  else if(ns==="curved"){ setLinkStyle(l.source,l.target,"curved"); setLinkWaypoints(l.source,l.target,[]); setLinkCurvy(l.source,l.target,true); if(isEditing) setEditingLink(null); }
                                  else { setLinkStyle(l.source,l.target,"custom"); if(l.style==="curved"){ setLinkCurvy(l.source,l.target,true); seedFromCurve(l); } else { setLinkCurvy(l.source,l.target,!!l.curvy); if(!l.waypoints) setLinkWaypoints(l.source,l.target,[]); } }
                                }}>
                                  <option value="straight">Straight</option>
                                  <option value="curved">Curved</option>
                                  <option value="custom">Custom</option>
                                </select>

                                {l.style==="custom" && (
                                  <>
                                    <label style={{marginLeft:6, opacity:.7}}>geom</label>
                                    <select value={l.curvy?"curvy":"straight"} onChange={(e)=>setLinkCurvy(l.source,l.target,e.target.value==="curvy")}>
                                      <option value="straight">Straight segments</option>
                                      <option value="curvy">Curvy spline</option>
                                    </select>
                                  </>
                                )}

                                <button className="btn" type="button" onClick={()=>{
                                  if(l.style==="straight"){ setLinkStyle(l.source,l.target,"custom"); setLinkCurvy(l.source,l.target,false); if(!l.waypoints) setLinkWaypoints(l.source,l.target,[]); }
                                  if(l.style==="curved"){ setLinkStyle(l.source,l.target,"custom"); setLinkCurvy(l.source,l.target,true); seedFromCurve(l); }
                                  setEditingLink({source:l.source,target:l.target});
                                }}>{isEditing ? "Editing…" : "Edit Path"}</button>

                                {style==="custom" && <button className="btn" type="button" onClick={()=>setLinkWaypoints(l.source,l.target,[])}>Clear pts</button>}
                                <button className="btn" type="button" onClick={()=>removeLink(l.source,l.target)}>×</button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    <div className="actions">
                      <button className="btn" type="reset">Reset</button>
                      <button className="btn btn-primary" type="submit">Save</button>
                    </div>
                  </form>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <GraphPanOverlay onPanBy={(dx,dy)=>panByRef.current(dx,dy)}/>
    </div>
  );
}
