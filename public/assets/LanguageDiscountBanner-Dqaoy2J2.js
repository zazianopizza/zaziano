import{r as s,j as e}from"./index-DV5yiE3M.js";const x=({lang:n,setLang:r,totalAmount:l})=>{s.useEffect(()=>{const o=localStorage.getItem("siteLang");if(o&&["en","de"].includes(o))r(o);else{const a=navigator.language.startsWith("de")?"de":"en";r(a),localStorage.setItem("siteLang",a)}},[]),s.useEffect(()=>{localStorage.setItem("siteLang",n)},[n]);const i={en:{eligible:"🎉 Get 15% discount !",note:"from 20 Euros !"},de:{eligible:"🎉 Sofort 15% Rabatt!",note:"Ab 20 Euro !"}}[n];return e.jsxs("div",{style:t.container,children:[e.jsx("style",{children:`
        @keyframes floatAnnouncer {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes pulseBadge {
          0% { transform: scale(1); box-shadow: 0 6px 20px rgba(255, 215, 0, 0.6); }
          50% { transform: scale(1.05); box-shadow: 0 8px 25px rgba(255, 215, 0, 0.9); }
          100% { transform: scale(1); }
        }

        @media (max-width: 600px) {
          .banner-inner {
            text-align: center;
            gap: 16px;
          }
          .promo-section {
            text-align: center !important;
          }
         
        }
      `}),e.jsxs("div",{style:t.bannerInner,className:"banner-inner",children:[e.jsx("div",{style:t.promoSection,children:e.jsxs("div",{style:t.promoTop,children:[e.jsx("h2",{style:t.promoTitle,children:i.eligible}),e.jsx("p",{style:t.promoNote,children:i.note})]})}),e.jsxs("div",{style:t.discountBadge,children:[e.jsx("span",{style:t.discountPercent,children:"15%"}),e.jsx("span",{style:t.discountOff,children:"OFF"})]})]})]})},t={container:{position:"relative",background:"linear-gradient(135deg, #0f0c29, #302b63, #24243e)",padding:"20px",overflow:"hidden",boxShadow:"0 12px 40px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(255, 215, 0, 0.1)",color:"white"},bannerInner:{display:"flex",alignItems:"center",gap:"20px",position:"relative",zIndex:2},promoSection:{flex:1,textAlign:"left",minWidth:0},promoTitle:{fontSize:"1.5rem",fontWeight:"800",margin:"0 0 6px",background:"linear-gradient(90deg, #FFD700, #ffaf7b)",WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent",textShadow:"0 2px 4px rgba(0, 0, 0, 0.2)"},promoNote:{fontSize:"0.95rem",opacity:.9,margin:0,lineHeight:1.4},discountBadge:{background:"linear-gradient(135deg, #FFD700, #ff8c00)",color:"#000",fontWeight:"900",fontSize:"1.1rem",width:"60px",height:"60px",borderRadius:"50%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 20px rgba(255, 215, 0, 0.6)",flexShrink:0,animation:"pulseBadge 2s infinite"},discountPercent:{fontSize:"1.3rem",letterSpacing:"-0.5px"},discountOff:{fontSize:"0.8rem",fontWeight:"bold"}};export{x as P};
