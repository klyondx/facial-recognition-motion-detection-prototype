import React, { useEffect, useRef, useState } from "react"
import './App.css'
const blazeface = require('@tensorflow-models/blazeface')

const LOADING = "Loading..."
const NO_FACE = "No face - move into box..."
const NO_MOTION = "No motion detected"
const ONE_FACE = ""
const SNAP = "SNAP!"
const MULTIPLE_FACES = "Multiple faces"
let blazeFaceModel
let predictions
let predictionsContext
const countdownStates = ["One face - hold still...3", "One face - hold still...2", "One face - hold still...1"]
const previousMotionFrame = []
const significantBit = 1000000
const sampleSize = 20
const motionDiffThreshold = significantBit * 100
const motionFractionThreshold = 0.01

async function getNewPredictions(model, imgSelector) {
    const returnTensors = false
    const rawPredictions = await model.estimateFaces(imgSelector, returnTensors)
    predictions = []
    for (let i = 0; i < rawPredictions.length; i++) {
        const prediction = rawPredictions[i]
        if (prediction.probability[0] > .95) {
            predictions.push(prediction)
        }
    }
}

function drawPredictions() {
    if (!predictionsContext || !predictions) {
        return
    }

    if (predictions.length > 0) {
        for (let i = 0; i < predictions.length; i++) {
            const start = predictions[i].topLeft
            const end = predictions[i].bottomRight
            const size = [end[0] - start[0], end[1] - start[1]]

            // Render a rectangle over each detected face.
            predictionsContext.fillStyle = 'rgba(0, 0, 255, 0.2)'
            predictionsContext.fillRect(start[0], start[1], size[0], size[1])
            predictionsContext.fillStyle = 'rgba(255, 255, 255, 0.5)'
            for (let j = 0; j < predictions[i].landmarks.length; j++) {
                const landmark = predictions[i].landmarks[j]
                predictionsContext.beginPath()
                predictionsContext.arc(landmark[0], landmark[1], 2, 0, 2 * Math.PI, true)
                predictionsContext.fill()
            }
        }
    }
}

function getCurrentSceneState(recentMotion, predictions, snapping) {
    if (!recentMotion) {
        return NO_MOTION
    }

    if (snapping) {
        return SNAP
    }

    if (!predictions || predictions.length === 0) {
        return NO_FACE
    } else {
        if (predictions.length === 1) {
            return ONE_FACE
        } else {
            return MULTIPLE_FACES
        }
    }
}

function App() {

    const AICanvasRef = useRef(null)
    const photoCanvasRef = useRef(null)
    const motionCanvasRef = useRef(null)

    const videoRef = useRef(null)

    const aspectRatio = 3 / 4
    const snapScale = 0.6
    const videoContainerWidth = 600
    const videoSnapWidth = videoContainerWidth * snapScale

    const videoContainerDimensions = { width: videoContainerWidth, height: videoContainerWidth * aspectRatio }
    const videoSnapDimensions = { width: videoSnapWidth, height: videoSnapWidth * aspectRatio }

    const [loading, setLoading] = useState(true)
    const [snapping, setSnapping] = useState(false)
    const [recentMotion, setRecentMotion] = useState(false)
    const [sceneState, setSceneState] = useState(LOADING)
    const [countdownState, setCountdownState] = useState(0)

    //  Init - Load AI model, blank screens
    useEffect(() => {
        (async function loadFaceAIModel() {
            blazeFaceModel = await blazeface.load()
        })()

        const photoContext = photoCanvasRef.current.getContext("2d")
        if (!photoContext) {
            console.error("Missing 2d context")
            return
        }
        photoContext.fillRect(0, 0, videoSnapDimensions.width, videoSnapDimensions.height)

    }, [])

    //  Start main video feed
    useEffect(() => {
        startVideo()
        return () => {
            stopVideo()
        }
    }, [])

    //  AI video
    useEffect(() => {
        const AITimer = setInterval(() => {
            capturePhoto(AICanvasRef, true)
            drawPredictions()
        }, 50)
        return () => {
            clearInterval(AITimer)
        }
    }, [sceneState])

    //  Motion detection video
    useEffect(() => {
        const motionTimer = setInterval(() => {
            drawMotion()
        }, 100)
        return () => {
            clearInterval(motionTimer)
        }
    }, [])

    //  Countdown photo video
    useEffect(() => {
        const countdownTimer = setInterval(() => {
            if (!recentMotion) {
                return
            }
            if (sceneState === ONE_FACE) {
                if (countdownState === countdownStates.length - 1) {
                    capturePhoto(photoCanvasRef)
                    setSnapping(true)
                    setTimeout(() => {
                        setCountdownState(0)
                        setRecentMotion(false)
                        setSnapping(false)
                    }, 1000)
                } else {
                    setCountdownState(countdownState + 1)
                }
            } else {
                setCountdownState(0)
            }
        }, 1000)
        return () => {
            clearInterval(countdownTimer)
        }
    }, [sceneState, countdownState, recentMotion])

    //  Update scene state
    useEffect(() => {
        const updateSceneStateTimer = setInterval(() => {
            if (loading) {
                return
            }

            setSceneState(getCurrentSceneState(recentMotion, predictions, snapping))
        }, 50)
        return () => {
            clearInterval(updateSceneStateTimer)
        }
    }, [loading, recentMotion, sceneState, snapping])


    const startVideo = async () => {
        if (!navigator.mediaDevices) {
            return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true
        })
        if (videoRef.current) {
            videoRef.current.srcObject = stream
        }
        setLoading(false)
    }

    const stopVideo = () => {
        if (videoRef.current) {
            const mediaStream = videoRef.current.srcObject
            if (mediaStream) {
                mediaStream.getVideoTracks().forEach(track => track.stop())
            }
        }
    }

    const capturePhoto = (canvasRef, shouldUpdatePredictions) => {
        if (!canvasRef.current || !videoRef.current) {
            return
        }

        const newContext = canvasRef.current.getContext("2d")
        if (!newContext) {
            console.error("Missing 2d context")
            return
        }

        if (shouldUpdatePredictions) {
            predictionsContext = newContext
        }

        const sourceWidth = videoRef.current.videoWidth
        const sourceHeight = videoRef.current.videoHeight

        const profileWidth = videoRef.current.videoWidth * snapScale
        const profileHeight = videoRef.current.videoHeight * snapScale

        const xOffset = (sourceWidth - profileWidth) / 2
        const yOffset = (sourceHeight - profileHeight) / 2

        newContext.drawImage(videoRef.current, xOffset, yOffset, profileWidth, profileHeight, 0, 0, videoSnapDimensions.width, videoSnapDimensions.height)

        if (blazeFaceModel && shouldUpdatePredictions) {
            getNewPredictions(blazeFaceModel, canvasRef.current)
        }
    }

    function drawMotion() {
        const motionContext = motionCanvasRef.current.getContext("2d")
        if (!motionContext) {
            return
        }

        const sourceWidth = videoRef.current.videoWidth
        const sourceHeight = videoRef.current.videoHeight

        const profileWidth = videoRef.current.videoWidth * snapScale
        const profileHeight = videoRef.current.videoHeight * snapScale

        const xOffset = (sourceWidth - profileWidth) / 2
        const yOffset = (sourceHeight - profileHeight) / 2

        motionContext.drawImage(videoRef.current, xOffset, yOffset, profileWidth, profileHeight, 0, 0, videoSnapDimensions.width, videoSnapDimensions.height)

        const width = videoSnapDimensions.width
        const height = videoSnapDimensions.height
        const imageData = motionContext.getImageData(0, 0, width, height).data

        let totalPosMoved = 0
        let totalPos = 0
        for (let y = 0; y < height; y += sampleSize) {
            for (let x = 0; x < width; x += sampleSize) {
                totalPos++
                const pos = (x + y * width) * 4
                const red = imageData[pos]
                const green = imageData[pos + 1]
                const blue = imageData[pos + 2]

                const hexVal = red * 1000000 + green * 1000 + blue
                if (previousMotionFrame[pos] && Math.abs(previousMotionFrame[pos] - hexVal) > motionDiffThreshold) {
                    motionContext.fillStyle = `rgba(${red}, ${green}, ${blue}, 1)`
                    totalPosMoved++
                } else {
                    motionContext.fillStyle = `rgba(255, 255, 255, 1)`
                }

                motionContext.fillRect(x, y, sampleSize, sampleSize)
                previousMotionFrame[pos] = hexVal

            }
        }

        if (totalPosMoved/totalPos > motionFractionThreshold) {
            setRecentMotion(true)
        }
    }

    let sceneClasses = "sceneState "
    let sceneStateMessage = sceneState
    if (sceneState === ONE_FACE) {
        sceneClasses += "hasFace"
        sceneStateMessage += countdownStates[countdownState]
    }
    if (sceneState === SNAP) {
        sceneClasses += "snap"
    }

    if (sceneState === LOADING) {
        sceneClasses += "loading"
    }

  return (
    <div className="App">
      <header className="App-header">
          <div className={sceneClasses}>{sceneStateMessage}</div>
          <div className="videoContainer" style={{width: videoContainerDimensions.width, height: videoContainerDimensions.height }}>
              <div className="videoOverlay" style={{width: videoSnapDimensions.width, height: videoSnapDimensions.height }} />
              <video ref={videoRef} className="video" autoPlay />
          </div>
          <div>
              <div className="canvasHolder">
                  <canvas
                      ref={AICanvasRef}
                      width={videoSnapDimensions.width}
                      height={videoSnapDimensions.height}
                  />
                  <div className="canvasLabel">Face sensor</div>
              </div>
              <div className="canvasHolder">
                  <canvas
                      ref={motionCanvasRef}
                      width={videoSnapDimensions.width}
                      height={videoSnapDimensions.height}
                  />
                  <div className="canvasLabel">Motion sensor</div>
              </div>
              <div className="canvasHolder">
                  <canvas
                      ref={photoCanvasRef}
                      width={videoSnapDimensions.width}
                      height={videoSnapDimensions.height}
                  />
                  <div className="canvasLabel">Current photo</div>
              </div>
          </div>
      </header>
    </div>
  )
}

export default App
