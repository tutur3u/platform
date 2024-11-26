// import './MentionList.scss'

import React, {
  forwardRef, useEffect, useImperativeHandle,
  useState,
} from 'react'

export default forwardRef((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = index => {
    const item = props.items[index]

    if (item) {
      props.command({ id: item })
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-md flex flex-col gap-1 overflow-auto p-2.5 relative">
      {props.items.length
        ? props.items.map((item, index) => (
          <button
            className={`w-full flex items-center gap-1.5 text-left ${index === selectedIndex ? 'bg-gray-200' : ''} hover:bg-gray-100`}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item}
          </button>
        ))
        : <div className="p-2 text-gray-500">No result</div>
      }
    </div>
  )
})
