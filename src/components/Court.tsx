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
        // Flat white placeholder while the court image loads — matches the
        // line-art courts, so there's no color flash before they paint.
        <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      )}
    </Layer>
  )
}
