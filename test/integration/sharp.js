import sharp from 'sharp';

const roundedCorners = Buffer.from(
  '<svg><rect x="0" y="0" width="200" height="200" rx="50" ry="50"/></svg>'
);
 
sharp()
  .resize(200, 200)
  .composite([{
    input: roundedCorners,
    blend: 'dest-in'
  }])
  .png();
