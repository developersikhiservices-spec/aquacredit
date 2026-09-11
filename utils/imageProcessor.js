import sharp from 'sharp';

const processImageBuffer = async (buffer, options = {}) => {
  const {
    width = 1200,
    height = 1200,
    fit = 'inside',
    withoutEnlargement = true,
    outputFormat = 'webp',
    webpQuality = 75
  } = options;

  let image = sharp(buffer).resize(width, height, {
    fit,
    withoutEnlargement
  });

  if (outputFormat === 'webp') {
    image = image.webp({
      quality: webpQuality
    });
  } else if (outputFormat === 'jpeg') {
    image = image.jpeg({
      quality: 85,
      progressive: true
    });
  } else if (outputFormat === 'png') {
    image = image.png();
  } else {
    throw new Error(`Unsupported output format: ${outputFormat}`);
  }

  return image.toBuffer();
};

export default processImageBuffer;
