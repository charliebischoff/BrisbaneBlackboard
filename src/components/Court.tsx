import { Layer, Rect, Image as KonvaImage } from 'react-konva'
import { CourtType } from '../types'
import { COURT_DIMENSIONS, COURT_IMAGE_SRC } from '../lib/court'
import { useHTMLImage } from '../hooks/useHTMLImage'

interface Props {
  courtType: CourtType
}

export default function Court({ courtType }: Props) {
  const { width, height } = COURT_DIMENSIONS[courtType]
  const image = useHTMLImage(COURT_IMAGE_SRC[courtType])

  return (
    <Layer listening={false}>
      {image ? (
        <KonvaImage image={image} x={0} y={0} width={width} height={height} />
      ) : (
        // Hardwood-colored placeholder while the court image loads, so
        // there's no blank flash on first paint or when switching modes.
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: width, y: height }}
          fillLinearGradientColorStops={[0, '#b8763f', 1, '#9c5f2e']}
        />
      )}
    </Layer>
  )
}
