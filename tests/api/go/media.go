package main

import "sync"

var acceptedMediaTypes = []string{
	"image/png",
	"image/jpeg",
	"application/pdf",
	"text/plain",
}

const maxMediaBytes = 10 * 1024 * 1024 // 10MB

type storedMedia struct {
	ID          string
	Data        []byte
	ContentType string
	Filename    string
}

var (
	mediaStore   = make(map[string]*storedMedia)
	mediaStoreMu sync.RWMutex
)

func storeMediaBlob(data []byte, contentType string, filename string) *storedMedia {
	id := newUUID()
	media := &storedMedia{
		ID:          id,
		Data:        data,
		ContentType: contentType,
		Filename:    filename,
	}
	mediaStoreMu.Lock()
	mediaStore[id] = media
	mediaStoreMu.Unlock()
	return media
}

func getMedia(id string) *storedMedia {
	mediaStoreMu.RLock()
	defer mediaStoreMu.RUnlock()
	return mediaStore[id]
}

func resetMedia() {
	mediaStoreMu.Lock()
	defer mediaStoreMu.Unlock()
	mediaStore = make(map[string]*storedMedia)
}
