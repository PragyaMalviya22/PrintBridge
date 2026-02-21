"use client";
export default function Toast({ show, message, isError }) {
  return (
    <div style={{
      position:"fixed",bottom:24,left:"50%",transform:show?`translateX(-50%) translateY(0)`:`translateX(-50%) translateY(100px)`,
      padding:"12px 22px",background:"#12151c",border:`1px solid ${isError?"#f87171":"#34d399"}`,
      borderRadius:12,color:isError?"#f87171":"#34d399",fontSize:14,fontWeight:500,
      display:"flex",alignItems:"center",gap:10,boxShadow:"0 10px 40px rgba(0,0,0,0.5)",
      opacity:show?1:0,transition:"all .3s cubic-bezier(.34,1.56,.64,1)",zIndex:1000,maxWidth:"90vw",
    }}>
      <span>{isError?"⚠️":"✅"}</span><span>{message}</span>
    </div>
  );
}
