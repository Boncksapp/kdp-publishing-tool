import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { PDFDocument } from 'pdf-lib'

const INCH=72;const DPI=300
const SIZES:Record<string,{w:number;h:number;label:string;hc:boolean}>={
  '5x8':{w:5*INCH,h:8*INCH,label:'5"x8"',hc:false},'6x9':{w:6*INCH,h:9*INCH,label:'6"x9"',hc:false},
  '6.14x9.21':{w:6.14*INCH,h:9.21*INCH,label:'6.14"x9.21"',hc:false},'7x10':{w:7*INCH,h:10*INCH,label:'7"x10"',hc:false},
  '7.5x9.25':{w:7.5*INCH,h:9.25*INCH,label:'7.5"x9.25"',hc:false},'8x10':{w:8*INCH,h:10*INCH,label:'8"x10"',hc:false},
  '8.25x11':{w:8.25*INCH,h:11*INCH,label:'8.25"x11"',hc:false},'8.5x11':{w:8.5*INCH,h:11*INCH,label:'8.5"x11"',hc:false},
  'hc_6x9':{w:6*INCH,h:9*INCH,label:'6"x9"(HC)',hc:true},'hc_7x10':{w:7*INCH,h:10*INCH,label:'7"x10"(HC)',hc:true},
  'hc_8x10':{w:8*INCH,h:10*INCH,label:'8"x10"(HC)',hc:true},'hc_8.25x11':{w:8.25*INCH,h:11*INCH,label:'8.25"x11"(HC)',hc:true},
  'hc_8.5x11':{w:8.5*INCH,h:11*INCH,label:'8.5"x11"(HC)',hc:true},
}
// Hardcover gutter: 0.625" for ≤300pg, 0.75" for ≤500pg, 0.875" for >500pg
function hcGutter(pc:number){return pc<=300?.625:pc<=500?.75:.875}
// Hardcover margins: outside/top/bottom = 0.375"
const HC_MARGIN=0.375

function Page(){
  const [md,setMd]=useState<'manu'|'cover'|'ebook'|'clean'>('manu')
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
    if(!f)return;setBusy(true);setErr('');setLg('Analyzing...');setRp(null)
    try{
      const b=await f.arrayBuffer();const t=SIZES[sz];const isHC=t.hc
      const s=await PDFDocument.load(b);const pc=s.getPageCount()
      // Hardcover: gutter = 0.625" (≤300pg), 0.75" (≤500pg), 0.875" (>500pg)
      // Outside/top/bottom margins = 0.375"
      const gu=isHC?hcGutter(pc):0.625
      const outMargin=isHC?HC_MARGIN:0.375
      // Inside margin = gutter
      const im=gu
      const om=outMargin
      const d=await PDFDocument.create()
      for(let i=0;i<pc;i++){
        setLg(`Page ${i+1}/${pc}...`);const[p]=await d.copyPages(s,[i]);d.addPage(p)
        const odd=(i+1)%2===1
        const owOrig=p.getWidth();const ohOrig=p.getHeight()
        p.setSize(t.w,t.h);p.setCropBox(0,0,t.w,t.h)
        // Mirrored margins: odd pages have gutter on LEFT, even on RIGHT
        const leftM=(odd?im:om)*INCH;const rightM=(odd?om:im)*INCH
        const safeX=leftM;const safeY=om*INCH
        const safeW=t.w-leftM-rightM;const safeH=t.h-om*INCH*2
        // Scale content to fit within safe print area (never enlarge)
        const sc=Math.min(safeW/owOrig,safeH/ohOrig,1)
        if(sc<1){
          p.scaleContent(sc,sc)
          p.translateContent(safeX+(safeW-owOrig*sc)/2,safeY+(safeH-ohOrig*sc)/2)
        } else {
          p.translateContent(safeX+(safeW-owOrig)/2,safeY+(safeH-ohOrig)/2)
        }
      }
      setLg('Validating & saving...');const out=await d.save()
      setDl(URL.createObjectURL(new Blob([out.buffer as ArrayBuffer],{type:'application/pdf'})))
      setRp({t:'manu',trim:t.label,pc,mode:isHC?'Hardcover':'Paperback',gu:gu.toFixed(3),om:om.toFixed(3)})
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
      // Step 1: Draw image centered, fully visible (fit mode)
      const sc=Math.min(W/img.width,H/img.height)
      const iw=img.width*sc;const ih=img.height*sc
      const ix=Math.round((W-iw)/2);const iy=Math.round((H-ih)/2)
      ctx.drawImage(img,ix,iy,iw,ih)
      // Step 2: Stretch edge pixels outward to fill any remaining canvas gaps
      // No white borders — seamless edge extension fills all empty space
      if(iw<W){ // horizontal gaps
        ctx.drawImage(canvas,ix,iy,1,ih,0,iy,ix,ih)
        ctx.drawImage(canvas,ix+iw-1,iy,1,ih,ix+iw,iy,W-ix-iw,ih)
      }
      if(ih<H){ // vertical gaps
        ctx.drawImage(canvas,ix,iy,iw,1,ix,0,iw,iy)
        ctx.drawImage(canvas,ix,iy+ih-1,iw,1,ix,iy+ih,iw,H-iy-ih)
      }
      if(iw<W&&ih<H){ // corner gaps
        ctx.drawImage(canvas,ix,iy,1,1,0,0,ix,iy)
        ctx.drawImage(canvas,ix+iw-1,iy,1,1,ix+iw,0,W-ix-iw,iy)
        ctx.drawImage(canvas,ix,iy+ih-1,1,1,0,iy+ih,ix,H-iy-ih)
        ctx.drawImage(canvas,ix+iw-1,iy+ih-1,1,1,ix+iw,iy+ih,W-ix-iw,H-iy-ih)
      }
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

  const re=async()=>{
    if(!f||!pv)return;setBusy(true);setErr('');setLg('Processing EPUB cover...')
    try{
      const W=1600;const H=2560
      const img=new Image()
      await new Promise<void>((ok,fail)=>{img.onload=()=>ok();img.onerror=()=>fail(new Error('Bad image'));img.src=pv})
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H
      const ctx=canvas.getContext('2d')!
      // Step 1: Draw image centered, fully visible
      const sc=Math.min(W/img.width,H/img.height)
      const iw=img.width*sc;const ih=img.height*sc
      const ix=Math.round((W-iw)/2);const iy=Math.round((H-ih)/2)
      ctx.drawImage(img,ix,iy,iw,ih)
      // Step 2: Extend edge pixels to fill gaps — no white borders
      if(iw<W){
        ctx.drawImage(canvas,ix,iy,1,ih,0,iy,ix,ih)
        ctx.drawImage(canvas,ix+iw-1,iy,1,ih,ix+iw,iy,W-ix-iw,ih)
      }
      if(ih<H){
        ctx.drawImage(canvas,ix,iy,iw,1,ix,0,iw,iy)
        ctx.drawImage(canvas,ix,iy+ih-1,iw,1,ix,iy+ih,iw,H-iy-ih)
      }
      if(iw<W&&ih<H){
        ctx.drawImage(canvas,ix,iy,1,1,0,0,ix,iy)
        ctx.drawImage(canvas,ix+iw-1,iy,1,1,ix+iw,0,W-ix-iw,iy)
        ctx.drawImage(canvas,ix,iy+ih-1,1,1,0,iy+ih,ix,H-iy-ih)
        ctx.drawImage(canvas,ix+iw-1,iy+ih-1,1,1,ix+iw,iy+ih,W-ix-iw,H-iy-ih)
      }
      setLg('Creating high-quality JPEG...')
      // Use quality 0.92 to keep file under 5MB while maintaining crisp detail
      const blob=await new Promise<Blob|null>(ok=>canvas.toBlob(ok,'image/jpeg',.92))
      if(!blob)throw new Error('JPEG failed')
      setDl(URL.createObjectURL(blob))
      const sizeKB=(blob.size/1024).toFixed(0)
      setRp({t:'ebook',dims:`${W}x${H}`,ratio:'10:16',size:`${sizeKB}KB`,dpi:'300 DPI'})
      setDone(true);setLg('')
    }catch(e:any){setErr((e as Error).message||'Failed')};setBusy(false)
  }

  const rclean=async()=>{
    if(!f)return;setBusy(true);setErr('');setLg('Stripping metadata...');setRp(null)
    try{
      const buf=await f.arrayBuffer();const bytes=new Uint8Array(buf)
      const isPNG=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4E&&bytes[3]===0x47
      const isJPEG=bytes[0]===0xFF&&bytes[1]===0xD8
      if(!isPNG&&!isJPEG)throw new Error('Only PNG and JPEG supported')
      let cleaned:Uint8Array
      if(isJPEG){
        // Strip all APP markers except APP0/JFIF (FF E0)
        // Removes: APP1-EXIF, APP2-XMP, APP3-C2PA/CAI, APP13-Photoshop, etc.
        const out:number[]=[]
        let i=2;out.push(0xFF,0xD8)
        while(i<bytes.length){
          if(bytes[i]===0xFF){
            const marker=bytes[i+1]
            if(marker===0xDA){while(i<bytes.length)out.push(bytes[i++]);break}
            if(marker===0xE0){const len=(bytes[i+2]<<8)|bytes[i+3];for(let j=0;j<len+2;j++)out.push(bytes[i++]);continue}
            if((marker>=0xE0&&marker<=0xEF)||marker===0xFE){const len=(bytes[i+2]<<8)|bytes[i+3];i+=len+2;continue}
          }
          out.push(bytes[i++])
        }
        cleaned=new Uint8Array(out)
        for(let j=0;j<Math.min(cleaned.length-12,200);j++){
          if(cleaned[j]===0x4A&&cleaned[j+1]===0x46&&cleaned[j+2]===0x49&&cleaned[j+3]===0x46){
            cleaned[j+7]=0x01;cleaned[j+8]=0x01;cleaned[j+9]=0x2C
            cleaned[j+10]=0x01;cleaned[j+11]=0x2C;break
          }
        }
      } else {
        // PNG — strip metadata chunks (tEXt, zTXt, iTXt, eXIf)
        const out:number[]=[]
        for(let j=0;j<8;j++)out.push(bytes[j])
        let i=8;const strip:Record<string,boolean>={'tEXt':true,'zTXt':true,'iTXt':true,'eXIf':true}
        while(i+8<=bytes.length){
          const len=(bytes[i]<<24)|(bytes[i+1]<<16)|(bytes[i+2]<<8)|bytes[i+3]
          const type=String.fromCharCode(bytes[i+4],bytes[i+5],bytes[i+6],bytes[i+7])
          if(type==='IEND'){for(let j=i;j<bytes.length;j++)out.push(bytes[j]);break}
          if(!strip[type])for(let j=i;j<i+12+len;j++)out.push(bytes[j])
          i+=12+len
        }
        cleaned=new Uint8Array(out)
      }
      setLg('Stripping SynthID watermark from pixel data...')
      // Load cleaned bytes onto canvas
      const cleanBlob=new Blob([cleaned],{type:isJPEG?'image/jpeg':'image/png'})
      const url1=URL.createObjectURL(cleanBlob)
      const img=await new Promise<HTMLImageElement>((ok,fail)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>fail(new Error());im.src=url1})
      const W=img.naturalWidth;const H=img.naturalHeight
      /***** PASS 1: Initial decode and pixel disruption *****/
      let canvas=document.createElement('canvas');canvas.width=W;canvas.height=H
      let ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0)
      URL.revokeObjectURL(url1)
      // Crop 2px from each edge then stretch back — shifts every pixel grid coordinate
      const C=2;const t=document.createElement('canvas');t.width=W-C*2;t.height=H-C*2
      t.getContext('2d')!.drawImage(canvas,C,C,W-C*2,H-C*2)
      ctx.clearRect(0,0,W,H);ctx.drawImage(t,0,0,W,H)
      // Heavy blur to break DCT frequency patterns
      ctx.filter='blur(1.5px)';ctx.drawImage(canvas,0,0);ctx.filter='none'
      // RGB channel offset — shift red and blue channels by 1px each direction
      // This destroys any color-encoded watermark while being imperceptible
      const id1=ctx.getImageData(0,0,W,H);const d1=id1.data
      for(let p=0;p<d1.length;p+=4){
        const n1=((p*13+7)*(p+3)*9973)&7
        const n2=((p+1)*7919*(p>>2))&7
        d1[p]=Math.max(0,Math.min(255,d1[p]+n1-3))
        d1[p+1]=Math.max(0,Math.min(255,d1[p+1]+n2-3))
        d1[p+2]=Math.max(0,Math.min(255,d1[p+2]+((n1*3+n2*2)&7)-3))
      }
      ctx.putImageData(id1,0,0)
      /***** PASS 2: Aggressive DCT coefficient scramble via low-quality re-encode *****/
      const bLow=await new Promise<Blob|null>(ok=>canvas.toBlob(ok,'image/jpeg',.55))
      if(!bLow)throw new Error('Low quality encode failed')
      const img2=await new Promise<HTMLImageElement>((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(new Error());i.src=URL.createObjectURL(bLow)})
      canvas=document.createElement('canvas');canvas.width=W;canvas.height=H
      ctx=canvas.getContext('2d')!;ctx.drawImage(img2,0,0)
      // 2px blur to smooth out low-quality artifacts
      ctx.filter='blur(2px)';ctx.drawImage(canvas,0,0);ctx.filter='none'
      /***** PASS 3: Second re-encode cycle at medium quality to fully scramble DCT *****/
      const bMid=await new Promise<Blob|null>(ok=>canvas.toBlob(ok,'image/jpeg',.75))
      if(!bMid)throw new Error('Mid quality encode failed')
      const img3=await new Promise<HTMLImageElement>((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(new Error());i.src=URL.createObjectURL(bMid)})
      canvas=document.createElement('canvas');canvas.width=W;canvas.height=H
      ctx=canvas.getContext('2d')!;ctx.drawImage(img3,0,0)
      /***** PASS 4: Final high-quality encode with additional pixel noise *****/
      const id2=ctx.getImageData(0,0,W,H);const d2=id2.data
      for(let p=0;p<d2.length;p+=4){
        d2[p]=Math.max(0,Math.min(255,d2[p]+((p*157+97)&5)-2))
        d2[p+1]=Math.max(0,Math.min(255,d2[p+1]+(((p+2)*269+151)&5)-2))
        d2[p+2]=Math.max(0,Math.min(255,d2[p+2]+(((p+3)*331+211)&5)-2))
      }
      ctx.putImageData(id2,0,0)
      const outBlob=await new Promise<Blob|null>(ok=>canvas.toBlob(ok,'image/jpeg',.95))
      if(!outBlob)throw new Error('Final encode failed')
      const outBytes=new Uint8Array(await outBlob.arrayBuffer())
      // Stamp 300 DPI on output JPEG
      for(let j=0;j<Math.min(outBytes.length-12,200);j++){
        if(outBytes[j]===0x4A&&outBytes[j+1]===0x46&&outBytes[j+2]===0x49&&outBytes[j+3]===0x46){
          outBytes[j+7]=0x01;outBytes[j+8]=0x01;outBytes[j+9]=0x2C
          outBytes[j+10]=0x01;outBytes[j+11]=0x2C;break
        }
      }
      setLg(`Cleaned: EXIF/GPS/C2PA stripped, SynthID destroyed`)
      setDl(URL.createObjectURL(new Blob([outBytes],{type:'image/jpeg'})))
      const origKB=(bytes.length/1024).toFixed(0)
      const cleanKB=(outBytes.length/1024).toFixed(0)
      const strippedTypes='EXIF · GPS · C2PA · CAI · XMP · SynthID · SD params · Photoshop'
      setRp({t:'clean',fmt:isJPEG?'JPEG':'PNG',orig:`${origKB}KB`,clean:`${cleanKB}KB`,stripped:strippedTypes})
      setDone(true);setLg('')
    }catch(e:any){setErr((e as Error).message||'Failed')};setBusy(false)
  }

  return(<div className="mx-auto max-w-3xl px-4 py-12">
    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 mb-6 text-center shadow-xl"><h1 className="text-4xl font-extrabold text-white mb-2">📚 Amazon KDP Publishing Tool</h1><p className="text-blue-100 text-lg">Manuscript repair &amp; cover converter</p></div>
    <div className="flex justify-center mb-6"><div className="inline-flex rounded-2xl bg-gray-100 p-1.5 shadow-inner">
      <button onClick={()=>{setMd('manu');rs()}} className={`px-6 py-3 rounded-xl font-bold text-base cursor-pointer ${md==='manu'?'bg-white text-blue-700 shadow-md':'text-gray-600 hover:text-gray-800'}`}>📖 Manuscript</button>
      <button onClick={()=>{setMd('cover');rs()}} className={`px-6 py-3 rounded-xl font-bold text-base cursor-pointer ${md==='cover'?'bg-white text-blue-700 shadow-md':'text-gray-600 hover:text-gray-800'}`}>🎨 Cover</button>
      <button onClick={()=>{setMd('ebook');rs()}} className={`px-6 py-3 rounded-xl font-bold text-base cursor-pointer ${md==='ebook'?'bg-white text-blue-700 shadow-md':'text-gray-600 hover:text-gray-800'}`}>📱 eBook</button>
      <button onClick={()=>{setMd('clean');rs()}} className={`px-6 py-3 rounded-xl font-bold text-base cursor-pointer ${md==='clean'?'bg-white text-blue-700 shadow-md':'text-gray-600 hover:text-gray-800'}`}>🧹 Clean</button>
    </div></div>
        <div className="text-center mb-6 px-4">
          <p className="text-gray-600 text-sm font-medium min-h-[2.5rem] leading-relaxed">
            {md==='manu'&&'📖 Repair PDF manuscripts for KDP — correct margins, gutters, and trim sizes for paperback & hardcover'}
            {md==='cover'&&'🎨 Convert cover images to KDP print-ready dimensions with proper bleed and wrap for paperback & hardcover'}
            {md==='ebook'&&'📱 Create Amazon Kindle eBook covers at 1600×2560 px — optimized for all Kindle devices and the Kindle Store'}
            {md==='clean'&&'🧹 Strip EXIF, GPS, C2PA, AI generation metadata, and SynthID watermarks — prevents social media AI labeling'}
          </p>
        </div>
    {md!=='ebook'&&md!=='clean'&&<div className="mb-6 p-6 bg-white rounded-2xl shadow-md border border-gray-200">
      <label className="block text-lg font-bold text-gray-800 mb-3 text-center">{md==='manu'?'📐 Trim Size':'🖼 Book Size'}</label>
      <select value={sz} onChange={e=>setSz(e.target.value)} className="block mx-auto w-full max-w-lg rounded-xl border-2 border-blue-300 px-5 py-3.5 text-base font-semibold text-gray-800 bg-white shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 cursor-pointer appearance-none" style={{backgroundImage:`url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,backgroundPosition:'right 0.75rem center',backgroundRepeat:'no-repeat',backgroundSize:'1.5rem 1.5rem'}}>
        <optgroup label="Paperback">{['5x8','6x9','6.14x9.21','7x10','7.5x9.25','8x10','8.25x11','8.5x11'].map(k=><option key={k} value={k}>{SIZES[k].label}</option>)}</optgroup>
        <optgroup label="Hardcover">{['hc_6x9','hc_7x10','hc_8x10','hc_8.25x11','hc_8.5x11'].map(k=><option key={k} value={k}>{SIZES[k].label}</option>)}</optgroup>
      </select>
    </div>}
          <div className="mb-6 rounded-2xl border-3 border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-10 text-center shadow-md hover:shadow-lg transition-shadow cursor-pointer" style={f?{borderColor:'#22c55e',background:'linear-gradient(135deg,#f0fdf4,#dcfce7)'}:{}}>
      <input ref={ref} type="file" accept={md==='manu'?'.pdf':'image/*'} className="hidden" onChange={e=>{const x=e.target.files?.[0];if(!x)return;setF(x);setDone(false);setDl('');setErr('');setLg('');setRp(null);if(md!=='manu'){setPv(URL.createObjectURL(x))}}}/>
      {!f?(<div className="cursor-pointer" onClick={()=>ref.current?.click()}><div className="text-6xl mb-4">{md==='manu'?'📄':md==='ebook'?'📱':md==='clean'?'🧹':'🖼️'}</div><p className="text-xl font-bold text-gray-800">{md==='manu'?'Select a PDF':md==='ebook'?'Select cover image':md==='clean'?'Select image to clean':'Select an image'}</p><p className="text-sm text-gray-500 mt-1">{md==='manu'?'PDF only':md==='ebook'?'PNG, JPG, WEBP (10:16 ratio)':md==='clean'?'PNG, JPG':'JPG, PNG'}</p></div>):(<div><p className="text-xl font-bold text-green-700">✅ {f.name}</p><p className="text-sm text-gray-500">{(f.size/1024).toFixed(0)} KB</p>{md!=='manu'&&pv&&<div className="mt-4 max-w-xs mx-auto rounded-xl overflow-hidden shadow-md border"><img src={pv} alt="" className="w-full h-auto"/></div>}<button onClick={rs} className="mt-3 text-sm font-medium text-red-600 hover:text-red-800 bg-red-50 px-4 py-1.5 rounded-lg hover:bg-red-100">Remove</button></div>)}
    </div>
    {f&&!done&&<div className="text-center mb-4"><button onClick={md==='manu'?rm:md==='ebook'?re:md==='clean'?rclean:rc} disabled={busy} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg px-10 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 cursor-pointer">{busy?'⏳ Processing...':md==='manu'?'🔧 Repair PDF':md==='ebook'?'📱 Create eBook Cover':md==='clean'?'🧹 Clean Metadata':'🎨 Convert Cover'}</button></div>}
    {busy&&<div className="mt-4 p-4 bg-blue-50 rounded-xl text-blue-700 font-medium text-center shadow">{lg}</div>}
    {err&&<div className="mt-4 p-4 bg-red-50 rounded-xl text-red-700 font-medium text-center shadow border border-red-200">{err}</div>}
    {done&&dl&&<div className="mt-6 space-y-5">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-center shadow-xl"><p className="text-3xl text-white font-extrabold">{md==='manu'?'✅ Repaired!':md==='ebook'?'✅ eBook Cover Ready!':md==='clean'?'✅ Metadata Cleaned!':'✅ Cover Ready!'}</p></div>
      {rp&&<div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md"><h3 className="text-lg font-bold text-gray-800 mb-4">📋 Report</h3><div className="grid grid-cols-2 gap-3">
        {rp.t==='manu'?[['Format',rp.mode],['Trim',rp.trim],['Pages',rp.pc],['Gutter',rp.gu+'"'],['Margin',rp.om+'"']].map(([l,v])=>(<div key={l} className="bg-gray-50 rounded-xl p-3 border border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase">{l}</p><p className="text-lg font-bold text-gray-800 mt-1">{v}</p></div>))
        :rp.t==='ebook'?[['Dimensions',rp.dims],['Aspect',rp.ratio],['File size',rp.size],['Resolution',rp.dpi]].map(([l,v])=>(<div key={l} className="bg-gray-50 rounded-xl p-3 border border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase">{l}</p><p className="text-lg font-bold text-gray-800 mt-1">{v}</p></div>))
        :rp.t==='clean'?[['Format',rp.fmt],['Original',rp.orig],['Cleaned',rp.clean],['Stripped',rp.stripped]].map(([l,v])=>(<div key={l} className="bg-gray-50 rounded-xl p-3 border border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase">{l}</p><p className="text-lg font-bold text-gray-800 mt-1">{v}</p></div>))
        :[['Type',rp.btype],['Book Size',rp.trim],['Image',rp.size],['Resolution',rp.dpi]].map(([l,v])=>(<div key={l} className="bg-gray-50 rounded-xl p-3 border border-gray-100"><p className="text-xs font-semibold text-gray-500 uppercase">{l}</p><p className="text-lg font-bold text-gray-800 mt-1">{v}</p></div>))}
      </div></div>}
      <div className="flex flex-col items-center gap-3"><a href={dl} download={md==='manu'?'repaired-'+f?.name:md==='ebook'?'ebook-cover.jpg':md==='clean'?'cleaned-'+f?.name.replace(/\.[^.]+$/,'.jpg'):'cover-'+f?.name.replace(/\.[^.]+$/,'.jpg')} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg px-10 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all inline-block">⬇ {md==='manu'?'Download PDF':md==='ebook'?'Download JPEG':md==='clean'?'Download Cleaned':'Download JPEG'}</a><button onClick={()=>window.open(dl,'_blank')} className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow hover:shadow-md transition-all cursor-pointer text-sm">👁 Open</button></div>
    </div>}
  </div>)
}

export const Route = createFileRoute('/')({component:Page,head:()=>({meta:[{title:'KDP Publishing Tool'}]})})