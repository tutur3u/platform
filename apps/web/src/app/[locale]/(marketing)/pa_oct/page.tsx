export default function MarketingPage() {
    return (
      <div className="w-full text-left">
        <h1 className="text-6xl font-bold mb-12 text-left max-w-6xl mx-auto">
          Why us?
        </h1>
  
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Special Events */}
          <div className="relative max-w-sm mx-auto">
            <div className="rounded-t-2xl py-3"
              style={{background:'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)' }}>
              <div className="text-lg font-roboto font-semibold text-center text-white">SPECIAL EVENTS</div>
            </div>
            <div className="p-6 rounded-b-lg text-slate-300/90 border-2 border-slate-300/30"
              style={{background:'linear-gradient(155.48deg, #737373 -231.15%, rgba(255, 255, 255, 0) 78.52%)' }}>
              <div className="mb-4 font-semibold">
                Events organized to support you find career paths in technology, 
                gain deeper insights from company trips and alumni, and join 
                coding competitions.
              </div>
            </div>
          </div>
  
          {/* Networking */}
          <div className="relative max-w-sm mx-auto">
            <div className="rounded-t-2xl py-3"
              style={{background:'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)' }}>
              <div className="text-lg font-roboto font-semibold text-center text-white">NETWORKING</div>
            </div>
            <div className="p-6 rounded-b-lg text-slate-300/90 border-2 border-slate-300/30"
              style={{background:'linear-gradient(180.49deg, #737373 -274.71%, rgba(255, 255, 255, 0) 82.78%)' }}>
              <div className="mb-4 font-semibold">
                Events organized to support you find career paths in technology, 
                gain deeper insights from company trips and alumni, and join 
                coding competitions.
              </div>
            </div>
          </div>
  
          {/* Vision */}
          <div className="relative max-w-sm mx-auto">
            <div className="rounded-t-2xl py-3"
              style={{background:'linear-gradient(95.85deg, rgba(251, 200, 33, 0.7) -13.27%, rgba(94, 193, 224, 0.7) 100%)' }}>
              <div className="text-lg font-roboto font-semibold text-center text-white">VISION</div>
            </div>
            <div className="p-6 rounded-b-lg text-slate-300/90 border-2 border-slate-300/30"
              style={{background:'linear-gradient(192.7deg, #737373 -192.68%, rgba(255, 255, 255, 0) 74.62%)' }}>
              <div className="mb-4 font-semibold">
                Events organized to support you find career paths in technology, 
                gain deeper insights from company trips and alumni, and join 
                coding competitions.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }