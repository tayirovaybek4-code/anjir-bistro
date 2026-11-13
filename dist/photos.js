const photoRequests = new Map();
async function resolvePhoto(source) {
  if (!source.startsWith("photo:")) return source;
  if (!photoRequests.has(source)) {
    const url = new URL(window.BOOKING_ENDPOINT);
    url.searchParams.set("photo",source.slice(6));
    photoRequests.set(source,fetch(url).then(response => response.json()).then(result => {
      if (!result.ok || !result.image?.startsWith("data:image/jpeg;base64,")) throw Error("Rasm topilmadi.");
      return result.image;
    }).catch(error => {
      photoRequests.delete(source);
      throw error;
    }));
  }
  return photoRequests.get(source);
}

