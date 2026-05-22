import React from 'react';

export default function StoreBanner({ imageUrl }) {
  return (
    <section className="store-banner">
      <div className="store-banner-copy">
        <span>YakuPark Adventure Store</span>
        <h1>Lleva la aventura contigo</h1>
        <p>Productos exclusivos de YakuPark</p>
        <div>
          <b>Verano</b>
          <b>Paracas</b>
          <b>Aventura acuática</b>
        </div>
      </div>
      <div className="store-banner-media">
        <img src={imageUrl} alt="Merchandising YakuPark" />
      </div>
    </section>
  );
}
