interface ProfileTabProps {
    title: string;
    classname: string;
}

export default function ProfileTab({ title, classname }: ProfileTabProps) {
    return <div className={`${classname} rounded-lg h-fit`}>
        <div>{title}</div>
    </div>
}