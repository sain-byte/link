export default function PixelLogoSB({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outline gelap untuk kontras tajam pada mode gelap maupun terang */}
      <g fill="#050505">
        {/* Garis luar blok oranye atas */}
        <rect x="9" y="0" width="4" height="4" />
        <rect x="11" y="2" width="4" height="4" />
        {/* Garis luar huruf S */}
        <rect x="3" y="4" width="10" height="14" rx="0.5" />
        <rect x="1" y="6" width="12" height="6" rx="0.5" />
        <rect x="1" y="12" width="12" height="7" rx="0.5" />
        <rect x="3" y="17" width="8" height="4" rx="0.5" />
        {/* Garis luar huruf B */}
        <rect x="13" y="4" width="11" height="17" rx="0.5" />
        <rect x="15" y="6" width="11" height="6" rx="0.5" />
        <rect x="15" y="12" width="11" height="6" rx="0.5" />
        {/* Garis luar blok oranye bawah */}
        <rect x="11" y="21" width="4" height="4" />
        <rect x="13" y="23" width="4" height="4" />
      </g>

      {/* Pixel huruf S (Putih) */}
      <g fill="#FAFAFA">
        {/* Baris atas S */}
        <rect x="4" y="6" width="8" height="2.5" />
        {/* Kaki kiri atas S */}
        <rect x="2" y="8.5" width="2.5" height="2.5" />
        {/* Baris tengah S */}
        <rect x="4" y="11" width="8" height="2.5" />
        {/* Kaki kanan bawah S */}
        <rect x="9.5" y="13.5" width="2.5" height="2.5" />
        {/* Baris bawah S (kiri & kanan putih, tengah-kiri oranye) */}
        <rect x="2" y="16" width="2.5" height="2.5" />
        <rect x="7" y="16" width="2.5" height="2.5" />
      </g>

      {/* Pixel huruf B (Putih) */}
      <g fill="#FAFAFA">
        {/* Tulang kiri B */}
        <rect x="14.5" y="6" width="2.5" height="12.5" />
        {/* Baris atas B */}
        <rect x="17" y="6" width="3" height="2.5" />
        {/* Lengkung kanan atas B */}
        <rect x="22" y="8.5" width="2.5" height="2.5" />
        {/* Baris tengah B */}
        <rect x="17" y="11" width="5" height="2.5" />
        {/* Lengkung kanan bawah B */}
        <rect x="22" y="13.5" width="2.5" height="2.5" />
        {/* Baris bawah B */}
        <rect x="17" y="16" width="5" height="2.5" />
      </g>

      {/* Potongan dalam huruf S & B agar tetap bersih */}
      <g fill="#0A0A0A">
        <rect x="5" y="9" width="4" height="1.6" />
        <rect x="5" y="14" width="4" height="1.6" />
        <rect x="17.6" y="9" width="3.8" height="1.6" />
        <rect x="17.6" y="14" width="3.8" height="1.6" />
      </g>

      {/* 6 Titik Pixel Oranye (#F97316) dengan animasi kedip halus bergantian */}
      <rect
        x="10"
        y="1"
        width="2.5"
        height="2.5"
        fill="#F97316"
        className="sb-pixel-pulse"
        style={{ animationDelay: '0ms' }}
      />
      <rect
        x="12"
        y="3.5"
        width="2.5"
        height="2.5"
        fill="#F97316"
        className="sb-pixel-pulse"
        style={{ animationDelay: '320ms' }}
      />
      <rect
        x="19.5"
        y="6"
        width="2.5"
        height="2.5"
        fill="#F97316"
        className="sb-pixel-pulse"
        style={{ animationDelay: '640ms' }}
      />
      <rect
        x="4.5"
        y="16"
        width="2.5"
        height="2.5"
        fill="#F97316"
        className="sb-pixel-pulse"
        style={{ animationDelay: '960ms' }}
      />
      <rect
        x="12"
        y="21"
        width="2.5"
        height="2.5"
        fill="#F97316"
        className="sb-pixel-pulse"
        style={{ animationDelay: '1280ms' }}
      />
      <rect
        x="14"
        y="23.5"
        width="2.5"
        height="2.5"
        fill="#F97316"
        className="sb-pixel-pulse"
        style={{ animationDelay: '1600ms' }}
      />
    </svg>
  );
}
