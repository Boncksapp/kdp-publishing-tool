import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { PDFDocument } from 'pdf-lib'

const INCH=72;const DPI=300
const SIZES:Record<string,{w:number;h:number;label:string}>={
  '5x8':{w:5*INCH,h:8*INCH,label:'5"x8"'},'6x9':{w:6*INCH,h:9*INCH,label:'6"x9"'},
  '6.14x9.21':{w:6.14*INCH,h:9.21*INCH,label:'6.14"x9.21"'},'7x10':{w:7*INCH,h:10*INCH,label:'7"x10"'},
  '7.5x9.25':{w:7.5*INCH,h:9.25*INCH,label:'7.5"x9.25"'},'8x10':{w:8*INCH,h:10*INCH,label:'8"x10"'},
  '8.25x11':{w:8.25*INCH,h:11*INCH,label:'8.25"x11"'},'8.5x11':{w:8.5*INCH,h:11*INCH,label:'8.5"x11"'},
  'hc_6x9':{w:6*INCH,h:9*INCH,label:'6"x9"(HC)'},'hc_7x10':{w:7*INCH,h:10*INCH,label:'7"x10"(HC)'},
  'hc_8x10':{w:8*INCH,h:10*INCH,label:'8"x10"(HC)'},'hc_8.25x11':{w:8.25*INCH,h:11*INCH,label:'8.25"x11"(HC)'},
  'hc_8.5x11':{w:8.5*INCH,h:11*INCH,label:'8.5"x11"(HC)'},
}
function g(pc:number){return pc<=150?.375:pc<=300?.5:pc<=500?.625:pc<=700?.75:.875}

function Page(){
  const [md,setMd]=useState<'manu'|'cover'>('manu')
  const [sz,setSz]=useState('8.25x11')
  const [f,setF]=useState<File|null>(null)
  const [busy,setBusy]=useState(false)
  const [done,setDone]=useState(false)
  const [err,setErr]=useState('')
  const [dl,setDl]=useState('')
  const [lg,setLg]=useState('')
  const [rp,setRp]=useState<any>(null)
  const [pv,setPv]=useState('')
  const ref=useRef<HTMLInputElement>(null)
  const rs=()=>{setF(null);setDone(false);setDl('');setErr('');setLg('');setRp(null);setPv('')}

  const rm=async()=>{
    if(!f)return;setBusy(true);setErr('');setLg('Reading...');setRp(null)
    try{
      const b=await f.arrayBuffer();const t=SIZES[sz]
      const s=await PDFDocument.load(b);const pc=s.getPageCount();const gu=g(pc)
      const im=gu+.125;const m=t.w/INCH<6?.375:t.w/INCH<7?.5:.5
      const d=await PDFDocument.create()
      for(let i=0;i<pc;i++){
        setLg(`Page ${i+1}/${pc}...`);const[p]=await d.copyPages(s,[i]);d.addPage(p)
        const o=(i+1)%2===1
        // Save original page dimensions BEFORE modifying page size
        const owOrig=p.getWidth();const ohOrig=p.getHeight()
        p.setSize(t.w,t.h);p.setCropBox(0,0,t.w,t.h)
        const lM=(o?im:m)*INCH;const rM=(o?m:im)*INCH
        const sx=lM;const sy=m*INCH;const sw=t.w-lM-rM;const sh=t.h-m*INCH*2
        // Only scale if original content is larger than target page
        // This prevents shrinking text when the PDF is already the right trim size
        const sc=Math.min(t.w/owOrig,t.h/ohOrig,1)
        if(sc<1){p.scaleContent(sc,sc);p.translateContent(sx+(sw-owOrig*sc)/2,sy+(sh-ohOrig*sc)/2)}
        else{p.translateContent(sx+(sw-owOrig)/2,sy+(sh-ohOrig)/2)}
      }
      setLg('Saving...');const o=await d.save()
      setDl(URL.createObjectURL(new Blob([o.buffer as ArrayBuffer],{type:'application/pdf'})))
      setRp({t:'manu',trim:t.label,pc,g:gu.toFixed(3),im:im.toFixed(3),m:m.toFixed(3)})
      setDone(true);setLg('')
    }catch(e:any){setErr((e as Error).message||'Failed')};setBusy(false)
  }

  const rc=async()=>{
    if(!f||!pv)return;setBusy(true);setErr('');setLg('Processing...')
    try{
      const t=SIZES[sz];const tw=t.w/INCH;const th=t.h/INCH
      const isHC=sz.startsWith('hc_')
      // Paperback: 0.125" bleed right, 0.25" top/bottom. Hardcover: 0.563" wrap all 4 sides
      const cw=isHC?tw+1.126:tw+0.125
      const ch=isHC?th+1.126:th+0.25
      // Apply 10% over-engineer buffer to defeat 277 DPI KDP glitch
      const W=Math.round(cw*DPI*1.10);const H=Math.round(ch*DPI*1.10)
      const img=new Image()
      await new Promise<void>((ok,fail)=>{img.onload=()=>ok();img.onerror=()=>fail(new Error('Bad image'));img.src=pv})
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H
      const ctx=canvas.getContext('2d')!
      ctx.fillStyle='#FFF';ctx.fillRect(0,0,W,H)
      // Fit image within canvas (contain, not cover) so nothing gets cropped
      const sc=Math.min(W/img.width,H/img.height)
      ctx.drawImage(img,Math.round((W-Math.round(img.width*sc))/2),Math.round((H-Math.round(img.height*sc))/2),Math.round(img.width*sc),Math.round(img.height*sc))
      setLg('Creating JPEG...')
      const blob=await new Promise<Blob|null>(ok=>canvas.toBlob(ok,'image/jpeg',.95))
      if(!blob)throw new Error('JPEG failed')
      const buf=await blob.arrayBuffer();const bytes=new Uint8Array(buf)
      let found=false
      for(let i=0;i<Math.min(bytes.length-12,200);i++){
        if(bytes[i]===0x4A&&bytes[i+1]===0x46&&bytes[i+2]===0x49&&bytes[i+3]===0x46){
          bytes[i+7]=0x01;bytes[i+8]=0x01;bytes[i+9]=0x2C
          bytes[i+10]=0x01;bytes[i+11]=0x2C
          found=true;break
        }
      }
      if(!found)throw new Error('No JFIF header')
      setDl(URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'})))
      setRp({t:'cover',trim:t.label,size:`${cw}"x${ch}"`,dpi:`${W}x${H}px @300DPI`,btype:isHC?'Hardcover':'Paperback'})
      setDone(true);setLg('')
    }catch(e:any){setErr((e as Error).message||'Failed')};setBusy(false)
  }

  return(<div className="mx-auto max-w-3xl px-4 py-12">
    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 mb-6 text-center shadow-xl"><h1 className="text-4xl font-extrabold text-white mb-2">📚 Amazon KDP Publishing Tool</h1><p className="text-blue-100 text-lg">Manuscript repair &amp; cover converter</p></div>
    <div className="flex justify-center mb-6"><div className="inline-flex rounded-2xl bg-gray-100 p-1.5 shadow-inner">
      <button onClick={()=>{setMd('manu');rs()}} className={`px-6 py-3 rounded-xl font-bold text-base cursor-pointer ${md==='manu'?'bg-white text-blue-700 shadow-md':'text-gray-600 hover:text-gray-800'}`}>📖 Manuscript</button>
      <button onClick={()=>{setMd('cover');rs()}} className={`px-6 py-3 rounded-xl font-bold text-base cursor-pointer ${md==='cover'?'bg-white text-blue-700 shadow-md':'text-gray-600 hover:text-gray-800'}`}>🎨 Cover Image</button>
    </div></div>
    <div className="mb-6 p-6 bg-white rounded-2xl shadow-md border border-gray-200">
      <label className="block text-lg font-bold text-gray-800 mb-3 text-center">{md==='manu'?'📐 Trim Size':'🖼 Book Size'}</label>
      <select value={sz} onChange={e=>setSz(e.target.value)} className="block mx-auto w-full max-w-lg rounded-xl border-2 border-blue-300 px-5 py-3.5 text-base font-semibold text-gray-800 bg-white shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 cursor-pointer appearance-none" style={{backgroundImage:`url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,backgroundPosition:'right 0.75rem center',backgroundRepeat:'no-repeat',backgroundSize:'1.5rem 1.5rem'}}>
        <optgroup label="Paperback">{['5x8','6x9','6.14x9.21','7x10','7.5x9.25','8x10','8.25x11','8.5x11'].map(k=><option key={k} value={k}>{SIZES[k].label}</option>)}</optgroup>
        <optgroup label="Hardcover">{['hc_6x9','hc_7x10','hc_8x10','hc_8.25x11','hc_8.5x11'].map(k=><option key={k} value={k}>{SIZES[k].label}</option>)}</optgroup>
      </select>
    </div>
    <div className="mb-6 rounded-2xl border-3 border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-10 text-center shadow-md hover:shadow-lg transition-shadow cursor-pointer" style={f?{borderColor:'#22c55e',background:'linear-gradient(135deg,#f0fdf4,#dcfce7)'}:{}}>
      <input ref={ref} type="file" accept={md==='manu'?'.pdf':'image/*'} className="hidden" onChange={e=>{const x=e.target.files?.[0];if(!x)return;setF(x);setDone(false);setDl('');setErr('');setLg('');setRp(null);if(md==='cover'){setPv(URL.createObjectURL(x))}}}/>
      {!f?(<div className="cursor-pointer" onClick={()=>ref.current?.click()}><div className="text-6xl mb-4">{md==='manu'?'📄':'🖼️'}</div><p className="text-xl font-bold text-gray-800">{md==='manu'?'Select a PDF':'Select an image'}</p><p className="text-sm text-gray-500 mt-1">{md==='manu'?'PDF only':'JPG, PNG'}</p></div>):(<div><p className="text-xl font-bold text-green-700">✅ {f.name}</p><p className="text-sm text-gray-500">{(f.size/1024).toFixed(0)} KB</p>{md==='cover'&&pv&&<div className="mt-4 max-w-xs mx-auto rounded-xl overflow-hidden shadow-md border"><img src={pv} alt="" className="w-full h-auto"/></div>}<button onClick={rs} className="mt-3 text-sm font-medium text-red-600 hover:text-red-800 bg-red-50 px-4 py-1.5 rounded-lg hover:bg-red-100">Remove</button></div>)}
    </div>
    {f&&!done&&<div className="text-center mb-4"><button onClick={md==='manu'?rm:rc} disabled={busy} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg px-10 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 cursor-pointer">{busy?'⏳ Processing...':md==='manu'?'🔧 Repair PDF':'🎨 Convert Cover'}</button></div>}
    {busy&&<div className="mt-4 p-4 bg-blue-50 rounded-xl text-blue-700 font-medium text-center shadow">{lg}</div>}
    {err&&<div className="mt-4 p-4 bg-red-50 rounded-xl text-red-700 font-medium text-center shadow border border-red-200">{err}</div>}
    {done&&dl&&<div className="mt-6 space-y-5">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-center shadow-xl"><p className="text-3xl text-white font-extrabold">{md==='manu'?'✅ Repaired!':'✅ Cover Ready!'}</p></div>
      {rp&&<div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md"><h3 className="text-lg font-bold text-gray-800 mb-4">📋 Report</h3><div className="grid grid-cols-2 gap-3">
        {rp.t==='manu'?[['Trim',rp.trim],['Pages',rp.pc],['Gutter',rp.g+'"'],['Inside',rp.im+'"'],['Margin',rp.m+'"']].map(([l,v])=>(<div key={l} className="bg-gray-50 rounded-xl p-3 border border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase">{l}</p><p className="text-lg font-bold text-gray-800 mt-1">{v}</p></div>))
        :[['Type',rp.btype],['Book Size',rp.trim],['Image',rp.size],['Resolution',rp.dpi]].map(([l,v])=>(<div key={l} className="bg-gray-50 rounded-xl p-3 border border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase">{l}</p><p className="text-lg font-bold text-gray-800 mt-1">{v}</p></div>))}
      </div></div>}
      <div className="flex flex-col items-center gap-3"><a href={dl} download={md==='manu'?'repaired-'+f?.name:'cover-'+f?.name.replace(/\.[^.]+$/,'.jpg')} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg px-10 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all inline-block">⬇ {md==='manu'?'Download PDF':'Download JPEG'}</a><button onClick={()=>window.open(dl,'_blank')} className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow hover:shadow-md transition-all cursor-pointer text-sm">👁 Open</button></div>
    </div>}
  </div>)
}

export const Route = createFileRoute('/')({component:Page,head:()=>({meta:[{title:'KDP Publishing Tool'}]})})